import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import type {
  Paginated,
  PaginationQueryDto,
} from '../common/dto/pagination.query.dto';
import { ReactionsService } from '../reactions/reactions.service';
import { VideosService } from '../videos/videos.service';
import { Comment } from './entities/comment.entity';
import { CommentResponseDto } from './dto/comment.dto';
import {
  CommentForbiddenException,
  CommentNotFoundException,
  CommentReplyDepthException,
} from './comment.exceptions';

export interface CommentsPage extends Paginated<CommentResponseDto> {
  commentsCount: number;
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly repo: Repository<Comment>,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly videos: VideosService,
    private readonly reactions: ReactionsService,
  ) {}

  /** Comentários raiz paginados (mais recentes primeiro) com respostas em ordem cronológica. */
  async list(
    userId: string | null,
    videoId: string,
    query: PaginationQueryDto,
  ): Promise<CommentsPage> {
    const video = await this.videos.getViewable(userId, videoId);
    const [roots, total] = await this.repo.findAndCount({
      where: { video_id: video.id, parent_id: IsNull() },
      order: { created_at: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const replies = roots.length
      ? await this.repo.find({
          where: { parent_id: In(roots.map((r) => r.id)) },
          order: { created_at: 'ASC' },
        })
      : [];
    const all = [...roots, ...replies];
    const [authors, reactions] = await Promise.all([
      this.authorsByUserId(all.map((c) => c.user_id)),
      this.reactions.commentSummaries(
        userId,
        all.map((c) => c.id),
      ),
    ]);
    const reactionById = new Map(all.map((c, i) => [c.id, reactions[i]]));
    const toDto = (c: Comment): CommentResponseDto => ({
      id: c.id,
      videoId: c.video_id,
      parentId: c.parent_id,
      body: c.deleted_at ? null : c.body,
      deleted: !!c.deleted_at,
      author: c.deleted_at ? null : (authors.get(c.user_id) ?? null),
      mine: userId === c.user_id,
      reactions: reactionById.get(c.id) ?? {
        likes: 0,
        dislikes: 0,
        myReaction: null,
      },
      createdAt: c.created_at.toISOString(),
    });
    const items = roots.map((root) => ({
      ...toDto(root),
      replies: replies.filter((r) => r.parent_id === root.id).map(toDto),
    }));
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      commentsCount: await this.countForVideo(video.id),
    };
  }

  async countForVideo(videoId: string): Promise<number> {
    return this.repo.count({
      where: { video_id: videoId, deleted_at: IsNull() },
    });
  }

  /** Contagem de comentários (não excluídos) para vários vídeos (painel). */
  async countsForVideos(videoIds: string[]): Promise<Map<string, number>> {
    if (videoIds.length === 0) return new Map();
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('c.video_id', 'video_id')
      .addSelect('COUNT(*)::text', 'count')
      .where('c.video_id IN (:...ids)', { ids: videoIds })
      .andWhere('c.deleted_at IS NULL')
      .groupBy('c.video_id')
      .getRawMany<{ video_id: string; count: string }>();
    return new Map(rows.map((r) => [r.video_id, Number(r.count)]));
  }

  async create(
    userId: string,
    videoId: string,
    body: string,
  ): Promise<CommentResponseDto> {
    const video = await this.videos.getViewable(userId, videoId);
    const saved = await this.repo.save(
      this.repo.create({
        video_id: video.id,
        user_id: userId,
        parent_id: null,
        body,
      }),
    );
    return this.single(userId, saved);
  }

  /** Só comentários raiz aceitam resposta (profundidade máxima 2 — TD-06.2). */
  async reply(
    userId: string,
    commentId: string,
    body: string,
  ): Promise<CommentResponseDto> {
    const parent = await this.getActive(commentId);
    if (parent.parent_id) throw new CommentReplyDepthException();
    const video = await this.videos.getViewable(userId, parent.video_id);
    const saved = await this.repo.save(
      this.repo.create({
        video_id: video.id,
        user_id: userId,
        parent_id: parent.id,
        body,
      }),
    );
    return this.single(userId, saved);
  }

  /** Exclusão lógica pelo autor. */
  async remove(userId: string, commentId: string): Promise<void> {
    const comment = await this.getActive(commentId);
    if (comment.user_id !== userId) throw new CommentForbiddenException();
    comment.deleted_at = new Date();
    await this.repo.save(comment);
  }

  /** Garante que o comentário existe e não foi excluído (usado antes de reagir). */
  async assertActive(id: string): Promise<void> {
    await this.getActive(id);
  }

  private async getActive(id: string): Promise<Comment> {
    const comment = await this.repo.findOne({
      where: { id, deleted_at: IsNull() },
    });
    if (!comment) throw new CommentNotFoundException();
    return comment;
  }

  private async single(
    userId: string,
    c: Comment,
  ): Promise<CommentResponseDto> {
    const authors = await this.authorsByUserId([c.user_id]);
    return {
      id: c.id,
      videoId: c.video_id,
      parentId: c.parent_id,
      body: c.body,
      deleted: false,
      author: authors.get(c.user_id) ?? null,
      mine: true,
      reactions: { likes: 0, dislikes: 0, myReaction: null },
      createdAt: c.created_at.toISOString(),
    };
  }

  /** Autor = canal do usuário, exposto de forma mínima (TD-06.5). */
  private async authorsByUserId(
    userIds: string[],
  ): Promise<Map<string, { id: string; nickname: string; name: string }>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const channels = await this.channels.find({
      where: { user_id: In(unique) },
    });
    return new Map(
      channels.map((ch) => [
        ch.user_id,
        { id: ch.id, nickname: ch.nickname, name: ch.name },
      ]),
    );
  }
}

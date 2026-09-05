import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VideosService } from '../videos/videos.service';
import { VideoReaction } from './entities/video-reaction.entity';
import { CommentReaction } from './entities/comment-reaction.entity';
import { ReactionType } from './entities/reaction-type';
import { ReactionSummaryDto } from './dto/reaction.dto';

interface CountRow {
  target_id: string;
  type: ReactionType;
  count: string;
}

const EMPTY: ReactionSummaryDto = { likes: 0, dislikes: 0, myReaction: null };

@Injectable()
export class ReactionsService {
  constructor(
    @InjectRepository(VideoReaction)
    private readonly videoReactions: Repository<VideoReaction>,
    @InjectRepository(CommentReaction)
    private readonly commentReactions: Repository<CommentReaction>,
    private readonly videos: VideosService,
  ) {}

  // ---------- vídeos ----------

  /** Cria ou troca a reação (idempotente por usuário/vídeo — TD-06.1). Só vídeos visíveis. */
  async setVideoReaction(
    userId: string,
    videoId: string,
    type: ReactionType,
  ): Promise<ReactionSummaryDto> {
    const video = await this.videos.getViewable(userId, videoId);
    await this.videoReactions
      .createQueryBuilder()
      .insert()
      .values({ video_id: video.id, user_id: userId, type })
      .orUpdate(['type'], ['video_id', 'user_id'])
      .execute();
    return this.videoSummary(userId, video.id);
  }

  async removeVideoReaction(
    userId: string,
    videoId: string,
  ): Promise<ReactionSummaryDto> {
    const video = await this.videos.getViewable(userId, videoId);
    await this.videoReactions.delete({ video_id: video.id, user_id: userId });
    return this.videoSummary(userId, video.id);
  }

  async videoSummary(
    userId: string | null,
    videoId: string,
  ): Promise<ReactionSummaryDto> {
    const [summary] = await this.videoSummaries(userId, [videoId]);
    return summary ?? EMPTY;
  }

  /** Contagens + reação do usuário para vários vídeos numa consulta (painel/listagens). */
  async videoSummaries(
    userId: string | null,
    videoIds: string[],
  ): Promise<ReactionSummaryDto[]> {
    return this.summaries(this.videoReactions, 'video_id', userId, videoIds);
  }

  // ---------- comentários ----------

  async setCommentReaction(
    userId: string,
    commentId: string,
    type: ReactionType,
  ): Promise<ReactionSummaryDto> {
    await this.commentReactions
      .createQueryBuilder()
      .insert()
      .values({ comment_id: commentId, user_id: userId, type })
      .orUpdate(['type'], ['comment_id', 'user_id'])
      .execute();
    return this.commentSummary(userId, commentId);
  }

  async removeCommentReaction(
    userId: string,
    commentId: string,
  ): Promise<ReactionSummaryDto> {
    await this.commentReactions.delete({
      comment_id: commentId,
      user_id: userId,
    });
    return this.commentSummary(userId, commentId);
  }

  async commentSummary(
    userId: string | null,
    commentId: string,
  ): Promise<ReactionSummaryDto> {
    const [summary] = await this.commentSummaries(userId, [commentId]);
    return summary ?? EMPTY;
  }

  async commentSummaries(
    userId: string | null,
    commentIds: string[],
  ): Promise<ReactionSummaryDto[]> {
    return this.summaries(
      this.commentReactions,
      'comment_id',
      userId,
      commentIds,
    );
  }

  // ---------- comum ----------

  private async summaries<T extends VideoReaction | CommentReaction>(
    repo: Repository<T>,
    column: 'video_id' | 'comment_id',
    userId: string | null,
    ids: string[],
  ): Promise<ReactionSummaryDto[]> {
    if (ids.length === 0) return [];
    const rows = await repo
      .createQueryBuilder('r')
      .select(`r.${column}`, 'target_id')
      .addSelect('r.type', 'type')
      .addSelect('COUNT(*)::text', 'count')
      .where(`r.${column} IN (:...ids)`, { ids })
      .groupBy(`r.${column}`)
      .addGroupBy('r.type')
      .getRawMany<CountRow>();
    const mine = userId
      ? await repo.find({
          where: { [column]: In(ids), user_id: userId } as never,
        })
      : [];
    const mineByTarget = new Map(
      mine.map((r) => [
        (r as unknown as Record<string, string>)[column],
        r.type,
      ]),
    );
    return ids.map((id) => {
      const likes = rows.find(
        (r) => r.target_id === id && r.type === ReactionType.LIKE,
      );
      const dislikes = rows.find(
        (r) => r.target_id === id && r.type === ReactionType.DISLIKE,
      );
      return {
        likes: Number(likes?.count ?? 0),
        dislikes: Number(dislikes?.count ?? 0),
        myReaction: mineByTarget.get(id) ?? null,
      };
    });
  }
}

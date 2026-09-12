import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import type { Paginated } from '../common/dto/pagination.query.dto';
import {
  Video,
  VideoStatus,
  VideoVisibility,
} from '../videos/entities/video.entity';
import { FeedQueryDto, SearchQueryDto } from './dto/discovery.query.dto';

/** Leituras públicas de descoberta (home e busca) — TD-07.1/07.2. */
@Injectable()
export class DiscoveryService {
  constructor(
    @InjectRepository(Video) private readonly repo: Repository<Video>,
  ) {}

  /** Vídeos públicos, publicados e prontos, com canal e categoria. */
  private publicQuery(): SelectQueryBuilder<Video> {
    return this.repo
      .createQueryBuilder('video')
      .leftJoinAndSelect('video.channel', 'channel')
      .leftJoinAndSelect('video.category', 'category')
      .where('video.visibility = :visibility', {
        visibility: VideoVisibility.PUBLIC,
      })
      .andWhere('video.published_at IS NOT NULL')
      .andWhere('video.status = :status', { status: VideoStatus.READY })
      .orderBy('video.published_at', 'DESC');
  }

  async feed(query: FeedQueryDto): Promise<Paginated<Video>> {
    const qb = this.publicQuery();
    if (query.category)
      qb.andWhere('category.slug = :slug', { slug: query.category });
    const [items, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return { items, page: query.page, limit: query.limit, total };
  }

  /** Busca por título do vídeo e nome/nickname do canal (ILIKE, índices trigram). */
  async search(query: SearchQueryDto): Promise<Paginated<Video>> {
    const term = `%${escapeLike(query.q.trim())}%`;
    const [items, total] = await this.publicQuery()
      .andWhere(
        '(video.title ILIKE :term OR channel.name ILIKE :term OR channel.nickname ILIKE :term)',
        { term },
      )
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return { items, page: query.page, limit: query.limit, total };
  }
}

/** Escapa curingas do LIKE para que o termo seja literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

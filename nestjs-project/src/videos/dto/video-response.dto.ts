import { ApiProperty } from '@nestjs/swagger';
import {
  CategoryResponseDto,
  toCategoryResponse,
} from '../../categories/dto/category-response.dto';
import { Video, VideoStatus, VideoVisibility } from '../entities/video.entity';

export class VideoChannelSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'alice' })
  nickname: string;

  @ApiProperty({ example: 'Alice' })
  name: string;
}

/**
 * Representação de um vídeo. Nunca expõe chaves do storage; `error` só aparece para o dono.
 * `category` e `channel` aparecem quando a relação foi carregada na consulta.
 */
export class VideoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'aB3dE5fG7hI', description: 'URL curta única' })
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ enum: VideoStatus, enumName: 'VideoStatus' })
  status: VideoStatus;

  @ApiProperty({ enum: VideoVisibility, enumName: 'VideoVisibility' })
  visibility: VideoVisibility;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;

  @ApiProperty({
    description: 'true quando publicado (published_at preenchido)',
  })
  isPublished: boolean;

  @ApiProperty({ type: CategoryResponseDto, nullable: true })
  category: CategoryResponseDto | null;

  @ApiProperty({ type: VideoChannelSummaryDto, required: false })
  channel?: VideoChannelSummaryDto;

  @ApiProperty({ example: 0 })
  viewsCount: number;

  @ApiProperty({ type: Number, nullable: true })
  durationSec: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Tamanho em bytes do arquivo servido (original após confirmar; processado quando ready).',
  })
  sizeBytes: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Caminho relativo da thumbnail na API (custom ou gerada; null até existir).',
    example: '/videos/3f2b.../thumbnail',
  })
  thumbnailUrl: string | null;

  @ApiProperty({
    description: 'true quando o dono enviou uma thumbnail própria',
  })
  hasCustomThumbnail: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description:
      'Último erro de processamento. Presente apenas para o dono do canal.',
  })
  error?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class PaginatedVideosResponseDto {
  @ApiProperty({ type: [VideoResponseDto] })
  items: VideoResponseDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;
}

export interface ToVideoResponseOptions {
  /** true quando quem consulta é o dono do canal (habilita `error`). */
  owner: boolean;
}

export function isVideoPublished(
  video: Pick<Video, 'published_at' | 'status'>,
): boolean {
  return video.published_at !== null && video.status === VideoStatus.READY;
}

export function toVideoResponse(
  video: Video,
  { owner }: ToVideoResponseOptions,
): VideoResponseDto {
  const hasThumbnail = !!(video.custom_thumbnail_key || video.thumbnail_key);
  const dto: VideoResponseDto = {
    id: video.id,
    slug: video.slug,
    title: video.title,
    description: video.description ?? null,
    status: video.status,
    visibility: video.visibility ?? VideoVisibility.PUBLIC,
    publishedAt: video.published_at ? toIso(video.published_at) : null,
    isPublished: !!video.published_at,
    category: video.category ? toCategoryResponse(video.category) : null,
    viewsCount: video.views_count ?? 0,
    durationSec: video.duration_sec ?? null,
    sizeBytes: video.size_bytes == null ? null : Number(video.size_bytes),
    thumbnailUrl: hasThumbnail ? `/videos/${video.id}/thumbnail` : null,
    hasCustomThumbnail: !!video.custom_thumbnail_key,
    createdAt: toIso(video.created_at),
    updatedAt: toIso(video.updated_at),
  };
  if (video.channel) {
    dto.channel = {
      id: video.channel.id,
      nickname: video.channel.nickname,
      name: video.channel.name,
    };
  }
  if (owner) dto.error = video.error ?? null;
  return dto;
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return value ? new Date(value).toISOString() : new Date(0).toISOString();
}

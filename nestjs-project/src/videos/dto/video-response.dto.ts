import { ApiProperty } from '@nestjs/swagger';
import { Video, VideoStatus } from '../entities/video.entity';

/**
 * Representação pública de um vídeo. Nunca expõe chaves do storage; `error` só aparece
 * para o dono do canal.
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
      'Caminho relativo da thumbnail na API (null até o processamento).',
    example: '/videos/3f2b.../thumbnail',
  })
  thumbnailUrl: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Último erro de processamento. Presente apenas para o dono do canal.',
  })
  error?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export interface ToVideoResponseOptions {
  /** true quando quem consulta é o dono do canal (habilita `error`). */
  owner: boolean;
}

export function toVideoResponse(
  video: Video,
  { owner }: ToVideoResponseOptions,
): VideoResponseDto {
  const dto: VideoResponseDto = {
    id: video.id,
    slug: video.slug,
    title: video.title,
    description: video.description ?? null,
    status: video.status,
    durationSec: video.duration_sec ?? null,
    sizeBytes: video.size_bytes == null ? null : Number(video.size_bytes),
    thumbnailUrl: video.thumbnail_key ? `/videos/${video.id}/thumbnail` : null,
    createdAt: toIso(video.created_at),
    updatedAt: toIso(video.updated_at),
  };
  if (owner) dto.error = video.error ?? null;
  return dto;
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return value ? new Date(value).toISOString() : new Date(0).toISOString();
}

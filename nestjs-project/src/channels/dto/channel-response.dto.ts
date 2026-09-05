import { ApiProperty } from '@nestjs/swagger';
import { Channel } from '../entities/channel.entity';

export class ChannelResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Alice' })
  name: string;

  @ApiProperty({ example: 'alice' })
  nickname: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Vídeos públicos publicados', example: 3 })
  videosCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export function toChannelResponse(
  channel: Channel,
  videosCount: number,
): ChannelResponseDto {
  return {
    id: channel.id,
    name: channel.name,
    nickname: channel.nickname,
    description: channel.description ?? null,
    videosCount,
    createdAt: new Date(channel.created_at).toISOString(),
  };
}

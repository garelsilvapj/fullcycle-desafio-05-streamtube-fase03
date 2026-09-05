import { ApiProperty } from '@nestjs/swagger';
import { ChannelResponseDto } from '../../channels/dto/channel-response.dto';
import { VideoResponseDto } from '../../videos/dto/video-response.dto';

export class SubscriptionStateDto {
  @ApiProperty({
    description: 'true quando o usuário autenticado está inscrito',
  })
  subscribed: boolean;

  @ApiProperty({ example: 42 })
  subscribersCount: number;
}

export class FollowedChannelDto {
  @ApiProperty({ type: ChannelResponseDto })
  channel: ChannelResponseDto;

  @ApiProperty({ example: 42 })
  subscribersCount: number;

  @ApiProperty({
    type: [VideoResponseDto],
    description: 'Últimos vídeos públicos publicados',
  })
  latestVideos: VideoResponseDto[];

  @ApiProperty({ format: 'date-time' })
  subscribedAt: string;
}

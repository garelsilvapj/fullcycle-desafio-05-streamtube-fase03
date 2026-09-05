import { ApiProperty } from '@nestjs/swagger';
import { ReactionSummaryDto } from '../reactions/dto/reaction.dto';
import { SubscriptionStateDto } from '../subscriptions/dto/subscription.dto';

export class VideoSocialDto {
  @ApiProperty({ type: ReactionSummaryDto })
  reactions: ReactionSummaryDto;

  @ApiProperty({ example: 3 })
  commentsCount: number;

  @ApiProperty({
    type: SubscriptionStateDto,
    description: 'Inscrição no canal do vídeo',
  })
  subscription: SubscriptionStateDto;
}

export class VideoSocialStatsDto {
  @ApiProperty({ format: 'uuid' })
  videoId: string;

  @ApiProperty({ example: 12 })
  likes: number;

  @ApiProperty({ example: 1 })
  dislikes: number;

  @ApiProperty({ example: 3 })
  commentsCount: number;
}

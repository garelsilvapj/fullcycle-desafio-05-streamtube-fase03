import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { COMMENT_BODY_MAX_LENGTH } from '../entities/comment.entity';
import { ReactionSummaryDto } from '../../reactions/dto/reaction.dto';
import { VideoChannelSummaryDto } from '../../videos/dto/video-response.dto';

export class CreateCommentDto {
  @ApiProperty({ maxLength: COMMENT_BODY_MAX_LENGTH, example: 'Ótimo vídeo!' })
  @IsString()
  @MinLength(1)
  @MaxLength(COMMENT_BODY_MAX_LENGTH)
  body: string;
}

export class CommentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  videoId: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  parentId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'null quando o comentário foi excluído',
  })
  body: string | null;

  @ApiProperty()
  deleted: boolean;

  @ApiProperty({
    type: VideoChannelSummaryDto,
    nullable: true,
    description: 'Canal do autor',
  })
  author: VideoChannelSummaryDto | null;

  @ApiProperty({ description: 'true quando o usuário autenticado é o autor' })
  mine: boolean;

  @ApiProperty({ type: ReactionSummaryDto })
  reactions: ReactionSummaryDto;

  @ApiProperty({ type: () => [CommentResponseDto], required: false })
  replies?: CommentResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class PaginatedCommentsResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  items: CommentResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty({ description: 'Total de comentários raiz' })
  total: number;

  @ApiProperty({
    description: 'Total de comentários (raízes + respostas, não excluídos)',
  })
  commentsCount: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ReactionType } from '../entities/reaction-type';

export class SetReactionDto {
  @ApiProperty({ enum: ReactionType, enumName: 'ReactionType' })
  @IsEnum(ReactionType)
  type: ReactionType;
}

export class ReactionSummaryDto {
  @ApiProperty({ example: 12 })
  likes: number;

  @ApiProperty({ example: 1 })
  dislikes: number;

  @ApiProperty({
    enum: ReactionType,
    enumName: 'ReactionType',
    nullable: true,
    description:
      'Reação do usuário autenticado (null para anônimos ou sem reação).',
  })
  myReaction: ReactionType | null;
}

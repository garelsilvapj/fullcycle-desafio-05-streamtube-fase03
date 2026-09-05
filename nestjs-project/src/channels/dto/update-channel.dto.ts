import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  NotEquals,
  ValidateIf,
} from 'class-validator';
import { NICKNAME_PATTERN } from '../../videos/videos.constants';

export const CHANNEL_NAME_MAX_LENGTH = 50;
export const CHANNEL_DESCRIPTION_MAX_LENGTH = 1000;

export class UpdateChannelDto {
  @ApiPropertyOptional({ maxLength: CHANNEL_NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(CHANNEL_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    description: 'Minúsculas, dígitos e _ (3–50). "me" é reservado.',
    example: 'alice_videos',
  })
  @IsOptional()
  @IsString()
  @Matches(NICKNAME_PATTERN, {
    message:
      'nickname deve ter 3–50 caracteres: letras minúsculas, dígitos e _',
  })
  @NotEquals('me', { message: 'nickname reservado' })
  nickname?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: CHANNEL_DESCRIPTION_MAX_LENGTH,
    nullable: true,
  })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(CHANNEL_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

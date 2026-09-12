import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { VideoVisibility } from '../entities/video.entity';
import {
  VIDEO_DESCRIPTION_MAX_LENGTH,
  VIDEO_TITLE_MAX_LENGTH,
} from '../videos.constants';

/** Campos editáveis pelo dono. `null` em description/categoryId limpa o valor. */
export class UpdateVideoDto {
  @ApiPropertyOptional({ maxLength: VIDEO_TITLE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(VIDEO_TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: VIDEO_DESCRIPTION_MAX_LENGTH,
    nullable: true,
  })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(VIDEO_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ enum: VideoVisibility, enumName: 'VideoVisibility' })
  @IsOptional()
  @IsEnum(VideoVisibility)
  visibility?: VideoVisibility;
}

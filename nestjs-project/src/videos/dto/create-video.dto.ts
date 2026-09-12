import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  VIDEO_DESCRIPTION_MAX_LENGTH,
  VIDEO_MAX_SIZE_BYTES,
  VIDEO_TITLE_MAX_LENGTH,
} from '../videos.constants';

export class CreateVideoDto {
  @ApiProperty({
    example: 'Meu primeiro vídeo',
    maxLength: VIDEO_TITLE_MAX_LENGTH,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(VIDEO_TITLE_MAX_LENGTH)
  title: string;

  @ApiPropertyOptional({
    example: 'Descrição do vídeo',
    maxLength: VIDEO_DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(VIDEO_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Tamanho declarado do arquivo em bytes (máx. 10GB). Acima do threshold do storage o upload usa multipart.',
    example: 5_000_000,
    minimum: 1,
    maximum: VIDEO_MAX_SIZE_BYTES,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(VIDEO_MAX_SIZE_BYTES)
  sizeBytes?: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  THUMBNAIL_CONTENT_TYPES,
  type ThumbnailContentType,
} from '../videos.constants';

export class CreateThumbnailUploadDto {
  @ApiProperty({ enum: THUMBNAIL_CONTENT_TYPES, example: 'image/jpeg' })
  @IsIn(THUMBNAIL_CONTENT_TYPES)
  contentType: ThumbnailContentType;
}

export class ThumbnailUploadPlanDto {
  @ApiProperty({
    description: 'URL pré-assinada para o PUT da imagem (máx. 5MB).',
  })
  url: string;
}

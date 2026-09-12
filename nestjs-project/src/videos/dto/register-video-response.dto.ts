import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { VideoResponseDto } from './video-response.dto';

export class UploadPartDto {
  @ApiProperty({ example: 1 })
  partNumber: number;

  @ApiProperty({ description: 'URL pré-assinada para o PUT desta parte.' })
  url: string;
}

export class SingleUploadPlanDto {
  @ApiProperty({ enum: ['single'] })
  type: 'single';

  @ApiProperty({
    description: 'URL pré-assinada para o PUT do arquivo inteiro.',
  })
  url: string;
}

export class MultipartUploadPlanDto {
  @ApiProperty({ enum: ['multipart'] })
  type: 'multipart';

  @ApiProperty()
  uploadId: string;

  @ApiProperty({
    description: 'Tamanho de cada parte em bytes (a última pode ser menor).',
  })
  partSize: number;

  @ApiProperty({ type: [UploadPartDto] })
  parts: UploadPartDto[];
}

export class RegisterVideoResponseDto {
  @ApiProperty({ type: VideoResponseDto })
  video: VideoResponseDto;

  @ApiProperty({
    description:
      'Plano de upload: `single` (um PUT) ou `multipart` (várias partes + complete).',
    oneOf: [
      { $ref: getSchemaPath(SingleUploadPlanDto) },
      { $ref: getSchemaPath(MultipartUploadPlanDto) },
    ],
  })
  upload: SingleUploadPlanDto | MultipartUploadPlanDto;
}

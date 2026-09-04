import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateVideoDto {
  @ApiProperty({ example: 'Meu primeiro vídeo' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Descrição do vídeo' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Tamanho declarado do arquivo em bytes. Acima do threshold, o upload usa multipart (até 10GB).',
    example: 5_000_000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;
}

export class CompleteMultipartDto {
  @ApiProperty()
  @IsString()
  uploadId: string;

  @ApiProperty({
    description:
      'Partes enviadas, com partNumber e ETag retornado pelo storage.',
    example: [{ partNumber: 1, etag: '"abc"' }],
  })
  parts: { partNumber: number; etag: string }[];
}

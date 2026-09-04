import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { S3_MAX_PARTS } from '../videos.constants';

export class CompletedPartDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: S3_MAX_PARTS })
  @IsInt()
  @Min(1)
  @Max(S3_MAX_PARTS)
  partNumber: number;

  @ApiProperty({
    description: 'ETag devolvido pelo storage no PUT da parte.',
    example: '"9bb58f26192e4ba00f01e2e7b136bbd8"',
  })
  @IsString()
  @IsNotEmpty()
  etag: string;
}

export class CompleteMultipartDto {
  @ApiProperty({ description: 'uploadId devolvido no registro do vídeo.' })
  @IsString()
  @IsNotEmpty()
  uploadId: string;

  @ApiProperty({ type: [CompletedPartDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts: CompletedPartDto[];
}

export class AbortMultipartDto {
  @ApiProperty({ description: 'uploadId devolvido no registro do vídeo.' })
  @IsString()
  @IsNotEmpty()
  uploadId: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}

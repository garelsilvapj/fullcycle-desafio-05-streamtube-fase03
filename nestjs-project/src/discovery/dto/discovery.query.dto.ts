import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.query.dto';

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

export class FeedQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Slug da categoria',
    example: 'tecnologia',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,60}$/)
  category?: string;
}

export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Termo buscado no título do vídeo e no nome/nickname do canal',
    example: 'ffmpeg',
    minLength: SEARCH_MIN_LENGTH,
    maxLength: SEARCH_MAX_LENGTH,
  })
  @IsString()
  @MinLength(SEARCH_MIN_LENGTH)
  @MaxLength(SEARCH_MAX_LENGTH)
  q: string;
}

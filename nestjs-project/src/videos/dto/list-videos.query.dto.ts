import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.query.dto';
import { VideoStatus } from '../entities/video.entity';

export class ListVideosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VideoStatus, enumName: 'VideoStatus' })
  @IsOptional()
  @IsEnum(VideoStatus)
  status?: VideoStatus;

  @ApiPropertyOptional({
    description: 'true = só publicados; false = só rascunhos',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : (value as unknown),
  )
  @IsBoolean()
  published?: boolean;
}

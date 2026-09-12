import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { PaginationQueryDto } from '../common/dto/pagination.query.dto';
import { Public } from '../auth/decorators/public.decorator';
import { VideosService } from './videos.service';
import {
  PaginatedVideosResponseDto,
  toVideoResponse,
} from './dto/video-response.dto';

/**
 * Listagem pública dos vídeos de um canal. Vive no VideosModule (e não no ChannelsModule) para
 * evitar o ciclo ChannelsModule ↔ VideosModule (TD-04.7).
 */
@ApiTags('channels')
@Controller('channels/:nickname/videos')
export class ChannelVideosController {
  constructor(private readonly videos: VideosService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Vídeos públicos de um canal',
    description:
      'Só vídeos públicos, publicados e processados, mais recentes primeiro.',
  })
  @ApiParam({ name: 'nickname', example: 'alice' })
  @ApiResponse({ status: 200, type: PaginatedVideosResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Canal não encontrado',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async list(
    @Param('nickname') nickname: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedVideosResponseDto> {
    const page = await this.videos.listPublicByChannel(nickname, query);
    return {
      ...page,
      items: page.items.map((v) => toVideoResponse(v, { owner: false })),
    };
  }
}

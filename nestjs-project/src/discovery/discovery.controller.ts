import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  PaginatedVideosResponseDto,
  toVideoResponse,
} from '../videos/dto/video-response.dto';
import { DiscoveryService } from './discovery.service';
import { FeedQueryDto, SearchQueryDto } from './dto/discovery.query.dto';

const errorRef = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('discovery')
@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Public()
  @Get('feed')
  @ApiOperation({
    summary: 'Feed da home',
    description:
      'Vídeos públicos publicados, mais recentes primeiro; filtro opcional por categoria (slug).',
  })
  @ApiResponse({ status: 200, type: PaginatedVideosResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  async feed(
    @Query() query: FeedQueryDto,
  ): Promise<PaginatedVideosResponseDto> {
    const page = await this.discovery.feed(query);
    return {
      ...page,
      items: page.items.map((v) => toVideoResponse(v, { owner: false })),
    };
  }

  @Public()
  @Get('search')
  @ApiOperation({
    summary: 'Buscar vídeos',
    description:
      'Busca por título do vídeo e nome/nickname do canal entre vídeos públicos publicados.',
  })
  @ApiResponse({ status: 200, type: PaginatedVideosResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (termo < 2 caracteres)',
    schema: errorRef,
  })
  async search(
    @Query() query: SearchQueryDto,
  ): Promise<PaginatedVideosResponseDto> {
    const page = await this.discovery.search(query);
    return {
      ...page,
      items: page.items.map((v) => toVideoResponse(v, { owner: false })),
    };
  }
}

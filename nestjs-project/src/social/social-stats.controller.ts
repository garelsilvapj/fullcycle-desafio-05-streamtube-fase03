import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { CommentsService } from '../comments/comments.service';
import { ReactionsService } from '../reactions/reactions.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { VideosService } from '../videos/videos.service';
import { VideoSocialDto, VideoSocialStatsDto } from './social-stats.dto';

const errorRef = { $ref: getSchemaPath(ApiErrorEnvelope) };
const MAX_IDS = 50;

/** Agregados sociais por vídeo (página de visualização e painel). */
@ApiTags('social')
@Controller('social')
export class SocialStatsController {
  constructor(
    private readonly videos: VideosService,
    private readonly reactions: ReactionsService,
    private readonly comments: CommentsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Public()
  @Get('videos/:id')
  @ApiOperation({
    summary: 'Reações, comentários e inscrição no canal de um vídeo',
    description:
      'Público (vídeo publicado); com Bearer inclui a minha reação e se estou inscrito.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: VideoSocialDto })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  async video(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoSocialDto> {
    const userId = user?.sub ?? null;
    const video = await this.videos.getViewable(userId, id);
    const [reactions, commentsCount, subscription] = await Promise.all([
      this.reactions.videoSummary(userId, video.id),
      this.comments.countForVideo(video.id),
      this.subscriptions.state(userId, video.channel_id),
    ]);
    return { reactions, commentsCount, subscription };
  }

  @Get('videos')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Contagens de likes/dislikes/comentários para vários vídeos (painel)',
  })
  @ApiQuery({ name: 'ids', description: 'IDs separados por vírgula (máx. 50)' })
  @ApiResponse({ status: 200, type: [VideoSocialStatsDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  async many(@Query('ids') ids = ''): Promise<VideoSocialStatsDto[]> {
    const list = [
      ...new Set(
        ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, MAX_IDS);
    if (list.length === 0) return [];
    const [reactions, comments] = await Promise.all([
      this.reactions.videoSummaries(null, list),
      this.comments.countsForVideos(list),
    ]);
    return list.map((videoId, i) => ({
      videoId,
      likes: reactions[i].likes,
      dislikes: reactions[i].dislikes,
      commentsCount: comments.get(videoId) ?? 0,
    }));
  }
}

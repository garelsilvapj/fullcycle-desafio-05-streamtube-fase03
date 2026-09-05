import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { ReactionsService } from './reactions.service';
import { ReactionSummaryDto, SetReactionDto } from './dto/reaction.dto';

const errorRef = { $ref: getSchemaPath(ApiErrorEnvelope) };
const VIDEO_PARAM = { name: 'id', format: 'uuid', description: 'ID do vídeo' };

@ApiTags('reactions')
@Controller('videos')
export class VideoReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Public()
  @Get(':id/reactions')
  @ApiOperation({
    summary:
      'Contagem de likes/dislikes do vídeo (e a minha reação, se autenticado)',
  })
  @ApiParam(VIDEO_PARAM)
  @ApiResponse({ status: 200, type: ReactionSummaryDto })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  async summary(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReactionSummaryDto> {
    return this.reactions.videoSummary(user?.sub ?? null, id);
  }

  @Put(':id/reaction')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reagir ao vídeo (like/dislike; idempotente)' })
  @ApiParam(VIDEO_PARAM)
  @ApiResponse({ status: 200, type: ReactionSummaryDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  async set(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReactionDto,
  ): Promise<ReactionSummaryDto> {
    return this.reactions.setVideoReaction(user.sub, id, dto.type);
  }

  @Delete(':id/reaction')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remover minha reação ao vídeo' })
  @ApiParam(VIDEO_PARAM)
  @ApiResponse({ status: 200, type: ReactionSummaryDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReactionSummaryDto> {
    return this.reactions.removeVideoReaction(user.sub, id);
  }
}

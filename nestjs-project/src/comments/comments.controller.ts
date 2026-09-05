import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
import { PaginationQueryDto } from '../common/dto/pagination.query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { ReactionsService } from '../reactions/reactions.service';
import {
  ReactionSummaryDto,
  SetReactionDto,
} from '../reactions/dto/reaction.dto';
import { CommentsService } from './comments.service';
import {
  CommentResponseDto,
  CreateCommentDto,
  PaginatedCommentsResponseDto,
} from './dto/comment.dto';

const errorRef = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly reactions: ReactionsService,
  ) {}

  @Public()
  @Get('videos/:id/comments')
  @ApiOperation({
    summary: 'Comentários do vídeo (raízes paginadas + respostas)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaginatedCommentsResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  async list(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedCommentsResponseDto> {
    return this.comments.list(user?.sub ?? null, id, query);
  }

  @Post('videos/:id/comments')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Comentar um vídeo' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, type: CommentResponseDto })
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
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    return this.comments.create(user.sub, id, dto.body);
  }

  @Post('comments/:id/replies')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Responder a um comentário de primeiro nível' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID do comentário raiz',
  })
  @ApiResponse({ status: 201, type: CommentResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed ou resposta a uma resposta',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Comentário não encontrado',
    schema: errorRef,
  })
  async reply(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    return this.comments.reply(user.sub, id, dto.body);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Excluir meu comentário (exclusão lógica)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Comentário excluído' })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Comentário de outro usuário',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Comentário não encontrado',
    schema: errorRef,
  })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.comments.remove(user.sub, id);
  }

  @Put('comments/:id/reaction')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reagir a um comentário (like/dislike; idempotente)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: ReactionSummaryDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Comentário não encontrado',
    schema: errorRef,
  })
  async react(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReactionDto,
  ): Promise<ReactionSummaryDto> {
    await this.comments.assertActive(id);
    return this.reactions.setCommentReaction(user.sub, id, dto.type);
  }

  @Delete('comments/:id/reaction')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remover minha reação a um comentário' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: ReactionSummaryDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Comentário não encontrado',
    schema: errorRef,
  })
  async unreact(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReactionSummaryDto> {
    await this.comments.assertActive(id);
    return this.reactions.removeCommentReaction(user.sub, id);
  }
}

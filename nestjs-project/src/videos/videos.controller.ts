import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';

import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { AbortMultipartDto, CompleteMultipartDto } from './dto/multipart.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { ListVideosQueryDto } from './dto/list-videos.query.dto';
import { RelatedVideosQueryDto } from './dto/related-videos.query.dto';
import {
  CreateThumbnailUploadDto,
  ThumbnailUploadPlanDto,
} from './dto/thumbnail.dto';
import {
  PaginatedVideosResponseDto,
  toVideoResponse,
  VideoResponseDto,
} from './dto/video-response.dto';
import {
  MultipartUploadPlanDto,
  RegisterVideoResponseDto,
  SingleUploadPlanDto,
} from './dto/register-video-response.dto';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { VideoInvalidRangeException } from './video.exceptions';
import { parseRangeHeader } from './http-range.util';

const errorRef = { $ref: getSchemaPath(ApiErrorEnvelope) };
const ID_PARAM = { name: 'id', format: 'uuid', description: 'ID do vídeo' };

// O JwtAuthGuard é global (APP_GUARD): todas as rotas exigem autenticação.
// Nesta fase todo acesso é restrito ao dono do canal; leitura pública fica para a Fase 05.
// O rate limit global (10 req/min) existe para proteger o auth; polling de status e streaming
// por Range fazem dezenas de chamadas por minuto, então estas rotas (já autenticadas) não o usam.
@SkipThrottle()
@ApiTags('videos')
@ApiBearerAuth('access-token')
@ApiExtraModels(SingleUploadPlanDto, MultipartUploadPlanDto)
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly storage: StorageService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar vídeo e obter plano de upload',
    description:
      'Cria o vídeo como rascunho (status uploading) no canal do usuário e devolve uma URL pré-assinada (single) ou um plano multipart (arquivos grandes, até 10GB). O arquivo é enviado direto ao storage; depois chame confirm (single) ou multipart/complete.',
  })
  @ApiResponse({ status: 201, type: RegisterVideoResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Canal do usuário não encontrado',
    schema: errorRef,
  })
  async register(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoDto,
  ): Promise<RegisterVideoResponseDto> {
    const { video, upload } = await this.videos.register(user.sub, dto);
    return { video: toVideoResponse(video, { owner: true }), upload };
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar upload single',
    description:
      'Verifica que o objeto existe no storage, muda o vídeo para uploaded e enfileira o processamento.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({ status: 400, description: 'ID inválido', schema: errorRef })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description:
      'Estado inválido (já confirmado) ou arquivo ausente no storage',
    schema: errorRef,
  })
  async confirm(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponseDto> {
    const video = await this.videos.confirmUpload(user.sub, id);
    return toVideoResponse(video, { owner: true });
  }

  @Post(':id/multipart/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finalizar upload multipart',
    description:
      'Monta o objeto a partir das partes enviadas (ETags), muda para uploaded e enfileira o processamento.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description: 'Estado inválido ou arquivo ausente',
    schema: errorRef,
  })
  async completeMultipart(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteMultipartDto,
  ): Promise<VideoResponseDto> {
    const video = await this.videos.completeMultipart(
      user.sub,
      id,
      dto.uploadId,
      dto.parts,
    );
    return toVideoResponse(video, { owner: true });
  }

  @Post(':id/multipart/abort')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancelar upload multipart',
    description:
      'Descarta as partes já enviadas e remove o registro do vídeo (que nunca foi concluído).',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({
    status: 204,
    description: 'Upload cancelado e vídeo removido',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description: 'Estado inválido',
    schema: errorRef,
  })
  async abortMultipart(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AbortMultipartDto,
  ): Promise<void> {
    await this.videos.abortMultipart(user.sub, id, dto.uploadId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir vídeo',
    description:
      'Remove os objetos do storage e o registro. Não permitido enquanto o vídeo está em processamento.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 204, description: 'Vídeo excluído' })
  @ApiResponse({ status: 400, description: 'ID inválido', schema: errorRef })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description: 'Vídeo em processamento',
    schema: errorRef,
  })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.videos.delete(user.sub, id);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar meus vídeos (painel)',
    description:
      'Vídeos do canal do usuário autenticado, paginados, mais recentes primeiro. Filtros opcionais por status de processamento e publicação.',
  })
  @ApiResponse({ status: 200, type: PaginatedVideosResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Canal do usuário não encontrado',
    schema: errorRef,
  })
  async listMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListVideosQueryDto,
  ): Promise<PaginatedVideosResponseDto> {
    const page = await this.videos.listMine(user.sub, query);
    return {
      ...page,
      items: page.items.map((v) => toVideoResponse(v, { owner: true })),
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar vídeo',
    description:
      'Título, descrição, categoria e visibilidade. `null` limpa descrição/categoria.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo ou categoria não encontrado',
    schema: errorRef,
  })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVideoDto,
  ): Promise<VideoResponseDto> {
    const video = await this.videos.update(user.sub, id, dto);
    return toVideoResponse(video, { owner: true });
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publicar vídeo',
    description:
      'Só vídeos processados (ready). Idempotente: mantém a data da primeira publicação.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description: 'Vídeo ainda não processado',
    schema: errorRef,
  })
  async publish(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponseDto> {
    return toVideoResponse(await this.videos.publish(user.sub, id), {
      owner: true,
    });
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Despublicar vídeo (volta a rascunho)' })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  async unpublish(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponseDto> {
    return toVideoResponse(await this.videos.unpublish(user.sub, id), {
      owner: true,
    });
  }

  @Post(':id/thumbnail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar upload de thumbnail própria',
    description:
      'Devolve uma URL pré-assinada para o PUT da imagem (JPEG/PNG/WebP, até 5MB). Depois chame thumbnail/confirm.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: ThumbnailUploadPlanDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  async createThumbnailUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateThumbnailUploadDto,
  ): Promise<ThumbnailUploadPlanDto> {
    return this.videos.createThumbnailUpload(user.sub, id, dto.contentType);
  }

  @Post(':id/thumbnail/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar thumbnail própria',
    description:
      'Valida a imagem enviada (existe, ≤ 5MB) e passa a usá-la no lugar da gerada.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Thumbnail inválida',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  async confirmThumbnail(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponseDto> {
    return toVideoResponse(await this.videos.confirmThumbnail(user.sub, id), {
      owner: true,
    });
  }

  @Delete(':id/thumbnail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover thumbnail própria (volta à gerada pelo worker)',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  async removeThumbnail(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponseDto> {
    return toVideoResponse(
      await this.videos.removeCustomThumbnail(user.sub, id),
      {
        owner: true,
      },
    );
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Vídeo pela URL única (público)',
    description:
      'Vídeo publicado (público ou não listado). Rascunhos só para o dono (Bearer opcional); os demais recebem 404.',
  })
  @ApiParam({ name: 'slug', example: 'aB3dE5fG7hI' })
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  async bySlug(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('slug') slug: string,
  ): Promise<VideoResponseDto> {
    const video = await this.videos.getViewableBySlug(user?.sub ?? null, slug);
    return toVideoResponse(video, { owner: false });
  }

  @Public()
  @Post(':id/views')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registrar visualização',
    description:
      'Incrementa o contador do vídeo publicado. O player chama uma vez por reprodução.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 204, description: 'Visualização registrada' })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  async registerView(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.videos.registerView(id);
  }

  @Public()
  @Get(':id/related')
  @ApiOperation({
    summary: 'Vídeos relacionados',
    description:
      'Vídeos públicos publicados da mesma categoria (ou os mais recentes), excluindo o próprio.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: [VideoResponseDto] })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  async related(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RelatedVideosQueryDto,
  ): Promise<VideoResponseDto[]> {
    const videos = await this.videos.listRelated(id, query.limit);
    return videos.map((v) => toVideoResponse(v, { owner: false }));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar vídeo',
    description: 'Metadados e status de um vídeo do canal do usuário.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({ status: 400, description: 'ID inválido', schema: errorRef })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 403,
    description: 'Vídeo de outro canal',
    schema: errorRef,
  })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponseDto> {
    const video = await this.videos.getOwned(user.sub, id);
    return toVideoResponse(video, { owner: true });
  }

  @Public()
  @Get(':id/thumbnail')
  @ApiOperation({
    summary: 'Thumbnail do vídeo',
    description:
      'Redireciona (302) para a URL pré-assinada da thumbnail (própria ou gerada). Pública para vídeos publicados; o dono vê também os rascunhos (Bearer opcional).',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 302, description: 'Redirect para a thumbnail' })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado ou não publicado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description: 'Thumbnail ainda não gerada',
    schema: errorRef,
  })
  async thumbnail(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const key = await this.videos.thumbnailKey(user?.sub ?? null, id);
    res.redirect(
      HttpStatus.FOUND,
      await this.storage.createPresignedDownload(key),
    );
  }

  @Public()
  @Get(':id/download')
  @ApiOperation({
    summary: 'Baixar vídeo',
    description: 'Redireciona (302) para a URL pré-assinada do MP4 processado.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 302, description: 'Redirect para o arquivo' })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description: 'Vídeo ainda não está pronto',
    schema: errorRef,
  })
  async download(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { key } = await this.videos.readyKey(user?.sub ?? null, id);
    res.redirect(
      HttpStatus.FOUND,
      await this.storage.createPresignedDownload(key),
    );
  }

  @Public()
  @Get(':id/stream')
  @ApiOperation({
    summary: 'Streaming do vídeo',
    description:
      'Serve o MP4 processado com suporte a HTTP Range: sem header responde 200 com o arquivo inteiro; com `Range: bytes=...` responde 206 Partial Content. Range inválido responde 416.',
  })
  @ApiParam(ID_PARAM)
  @ApiResponse({ status: 200, description: 'Arquivo inteiro (video/mp4)' })
  @ApiResponse({ status: 206, description: 'Faixa parcial (Content-Range)' })
  @ApiResponse({
    status: 404,
    description: 'Vídeo não encontrado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description: 'Vídeo ainda não está pronto',
    schema: errorRef,
  })
  @ApiResponse({
    status: 416,
    description: 'Range não satisfatível',
    schema: errorRef,
  })
  async stream(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { video, key } = await this.videos.readyKey(user?.sub ?? null, id);
    const total = Number(video.size_bytes ?? 0);
    const parsed = parseRangeHeader(range, total);

    res.setHeader('Accept-Ranges', 'bytes');

    if (parsed.kind === 'unsatisfiable') {
      res.setHeader('Content-Range', `bytes */${total}`);
      throw new VideoInvalidRangeException();
    }

    if (parsed.kind === 'none') {
      const obj = await this.storage.getObject(key);
      res.status(HttpStatus.OK);
      res.setHeader('Content-Type', obj.contentType);
      if (obj.contentLength > 0) {
        res.setHeader('Content-Length', String(obj.contentLength));
      }
      this.pipe(obj.stream, res);
      return;
    }

    const { start, end } = parsed;
    const obj = await this.storage.getRange(key, start, end);
    res.status(HttpStatus.PARTIAL_CONTENT);
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(end - start + 1));
    this.pipe(obj.stream, res);
  }

  /** Encaminha o stream do storage e encerra a conexão se a origem falhar no meio. */
  private pipe(stream: NodeJS.ReadableStream, res: Response): void {
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}

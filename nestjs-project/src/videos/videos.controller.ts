import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { VideosService } from './videos.service';
import { CompleteMultipartDto, CreateVideoDto } from './dto/create-video.dto';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { VideoInvalidRangeException } from './video.exceptions';

// O JwtAuthGuard é global (APP_GUARD), então estas rotas já exigem autenticação;
// usamos apenas @CurrentUser para obter o usuário do token.
@ApiTags('videos')
@ApiBearerAuth()
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly storage: StorageService,
  ) {}

  /** Registra um vídeo no canal do usuário autenticado e retorna a URL de upload. */
  @Post()
  register(@CurrentUser() user: JwtPayload, @Body() dto: CreateVideoDto) {
    return this.videos.register(user.sub, dto);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.videos.confirmUpload(user.sub, id);
  }

  /** Finaliza um upload multipart (arquivos grandes) e enfileira o processamento. */
  @Post(':id/multipart/complete')
  completeMultipart(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CompleteMultipartDto,
  ) {
    return this.videos.completeMultipart(user.sub, id, dto.uploadId, dto.parts);
  }

  /** Cancela um upload multipart em andamento. */
  @Post(':id/multipart/abort')
  async abortMultipart(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('uploadId') uploadId: string,
  ) {
    await this.videos.abortMultipart(user.sub, id, uploadId);
    return { aborted: true };
  }

  @Get()
  listMine(@CurrentUser() user: JwtPayload) {
    return this.videos.listMine(user.sub);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.videos.get(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { key } = await this.videos.readyKey(id);
    const url = await this.storage.createPresignedDownload(key);
    return res.redirect(302, url);
  }

  /** Streaming com suporte a HTTP Range (206 Partial Content). */
  @Get(':id/stream')
  async stream(
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    const { video, key } = await this.videos.readyKey(id);
    const total = Number(video.size_bytes ?? 0);

    if (!range) {
      const { stream, contentType } = await this.storage.getRange(
        key,
        0,
        Math.max(0, total - 1),
      );
      res.status(200).setHeader('Content-Type', contentType);
      stream.pipe(res);
      return;
    }

    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (!match) throw new VideoInvalidRangeException();
    const start = parseInt(match[1], 10);
    const end = match[2]
      ? parseInt(match[2], 10)
      : Math.min(start + 1024 * 1024, total - 1);
    if (start > end || (total && start >= total))
      throw new VideoInvalidRangeException();

    const { stream, contentType } = await this.storage.getRange(
      key,
      start,
      end,
    );
    res.status(206);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total || '*'}`);
    res.setHeader('Content-Length', String(end - start + 1));
    stream.pipe(res);
  }
}

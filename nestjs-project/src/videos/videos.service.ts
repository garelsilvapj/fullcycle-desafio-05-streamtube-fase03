import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { Video, VideoStatus } from './entities/video.entity';
import { Channel } from '../channels/entities/channel.entity';
import { CreateVideoDto } from './dto/create-video.dto';
import { CompletedPart, StorageService } from '../storage/storage.service';
import { VideoQueueService } from '../queue/video-queue.service';
import { isPgUniqueViolationOnColumn } from '../common/database/pg-errors';
import { generateVideoSlug } from './slug.util';
import {
  buildVideoKeyPrefix,
  VIDEO_SLUG_COLUMN,
  VIDEO_SLUG_MAX_RETRIES,
  VIDEO_STORAGE_KEYS,
} from './videos.constants';
import type { RegisteredVideo, UploadPlan } from './videos.types';
import {
  ChannelNotFoundException,
  VideoChannelForbiddenException,
  VideoInvalidStateException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoUploadNotConfirmedException,
} from './video.exceptions';

/** Estados a partir dos quais o cliente ainda pode confirmar/cancelar o upload. */
const CONFIRMABLE = [VideoStatus.UPLOADING] as const;
/** Estados em que a exclusão é segura (o worker não está mexendo nos objetos). */
const DELETABLE = [
  VideoStatus.UPLOADING,
  VideoStatus.UPLOADED,
  VideoStatus.READY,
  VideoStatus.FAILED,
] as const;

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video) private readonly repo: Repository<Video>,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly storage: StorageService,
    private readonly queue: VideoQueueService,
  ) {}

  /** Resolve o canal do usuário autenticado (relação 1:1 user↔channel). */
  private async myChannel(userId: string): Promise<Channel> {
    const channel = await this.channels.findOne({ where: { user_id: userId } });
    if (!channel) throw new ChannelNotFoundException();
    return channel;
  }

  private assertStatus(video: Video, allowed: readonly VideoStatus[]): void {
    if (!allowed.includes(video.status)) {
      throw new VideoInvalidStateException(video.status, allowed);
    }
  }

  /**
   * Registra o vídeo (status uploading) e devolve o plano de upload:
   * - `single`: uma URL pré-assinada (PUT direto) para arquivos pequenos;
   * - `multipart`: uploadId + URLs por parte, para arquivos grandes (até 10GB).
   * O plano é gerado ANTES de persistir: se o storage falhar, nada fica órfão no banco.
   */
  async register(
    userId: string,
    dto: CreateVideoDto,
  ): Promise<RegisteredVideo> {
    const channel = await this.myChannel(userId);
    const id = randomUUID();
    const original_key = `${buildVideoKeyPrefix(channel.id, id)}/${VIDEO_STORAGE_KEYS.ORIGINAL}`;

    const upload = await this.planUpload(original_key, dto.sizeBytes);
    try {
      const video = await this.saveWithUniqueSlug({
        id,
        channel_id: channel.id,
        title: dto.title,
        description: dto.description ?? null,
        status: VideoStatus.UPLOADING,
        original_key,
      });
      return { video, upload };
    } catch (err) {
      if (upload.type === 'multipart') {
        await this.storage.abortMultipartUpload(original_key, upload.uploadId);
      }
      throw err;
    }
  }

  private async planUpload(
    key: string,
    sizeBytes: number | undefined,
  ): Promise<UploadPlan> {
    if (sizeBytes && this.storage.needsMultipart(sizeBytes)) {
      const plan = await this.storage.createMultipartUpload(key, sizeBytes);
      return { type: 'multipart', ...plan };
    }
    const url = await this.storage.createPresignedUpload(key);
    return { type: 'single', url };
  }

  /** Persiste o vídeo gerando um slug novo a cada colisão de unicidade (raríssima). */
  private async saveWithUniqueSlug(
    data: Omit<Partial<Video>, 'slug'>,
  ): Promise<Video> {
    let lastError: unknown;
    for (let attempt = 0; attempt < VIDEO_SLUG_MAX_RETRIES; attempt++) {
      const video = this.repo.create({ ...data, slug: generateVideoSlug() });
      try {
        return await this.repo.save(video);
      } catch (err) {
        if (!isPgUniqueViolationOnColumn(err, VIDEO_SLUG_COLUMN)) throw err;
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Não foi possível gerar um slug único para o vídeo');
  }

  /** Confirma o upload (single PUT): valida o objeto, muda para uploaded e enfileira. */
  async confirmUpload(userId: string, id: string): Promise<Video> {
    const video = await this.getOwned(userId, id);
    this.assertStatus(video, CONFIRMABLE);
    return this.markUploadedAndEnqueue(video);
  }

  /** Finaliza um upload multipart: monta o objeto no storage, confirma e enfileira. */
  async completeMultipart(
    userId: string,
    id: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<Video> {
    const video = await this.getOwned(userId, id);
    this.assertStatus(video, CONFIRMABLE);
    await this.storage.completeMultipartUpload(
      video.original_key,
      uploadId,
      parts,
    );
    return this.markUploadedAndEnqueue(video);
  }

  /** Cancela um upload multipart em andamento e descarta o registro (nunca foi enviado). */
  async abortMultipart(
    userId: string,
    id: string,
    uploadId: string,
  ): Promise<void> {
    const video = await this.getOwned(userId, id);
    this.assertStatus(video, CONFIRMABLE);
    await this.storage.abortMultipartUpload(video.original_key, uploadId);
    await this.repo.remove(video);
  }

  /** Exclui o vídeo do canal do usuário: objetos no storage primeiro, depois a linha. */
  async delete(userId: string, id: string): Promise<void> {
    const video = await this.getOwned(userId, id);
    this.assertStatus(video, DELETABLE);
    const keys = [
      video.original_key,
      video.processed_key,
      video.thumbnail_key,
    ].filter((k): k is string => typeof k === 'string' && k.length > 0);
    await this.storage.deleteObjects(keys);
    await this.repo.remove(video);
  }

  private async markUploadedAndEnqueue(video: Video): Promise<Video> {
    const head = await this.storage.head(video.original_key);
    if (!head) throw new VideoUploadNotConfirmedException();
    video.status = VideoStatus.UPLOADED;
    video.size_bytes = String(head.size);
    await this.repo.save(video);
    await this.queue.enqueue(video.id);
    return video;
  }

  async get(id: string): Promise<Video> {
    const video = await this.repo.findOne({ where: { id } });
    if (!video) throw new VideoNotFoundException();
    return video;
  }

  async listMine(userId: string): Promise<Video[]> {
    const channel = await this.myChannel(userId);
    return this.repo.find({
      where: { channel_id: channel.id },
      order: { created_at: 'DESC' },
    });
  }

  /** Recupera o vídeo garantindo que pertence ao canal do usuário. */
  async getOwned(userId: string, id: string): Promise<Video> {
    const channel = await this.myChannel(userId);
    const video = await this.get(id);
    if (video.channel_id !== channel.id) {
      throw new VideoChannelForbiddenException();
    }
    return video;
  }

  /**
   * Retorna a chave streamável do vídeo do próprio canal, somente se estiver pronto.
   * Acesso público/anônimo fica para a fase da página de visualização.
   */
  async readyKey(
    userId: string,
    id: string,
  ): Promise<{ video: Video; key: string }> {
    const video = await this.getOwned(userId, id);
    if (video.status !== VideoStatus.READY || !video.processed_key) {
      throw new VideoNotReadyException();
    }
    return { video, key: video.processed_key };
  }

  /** Chave da thumbnail gerada pelo worker (dono do canal). */
  async thumbnailKey(userId: string, id: string): Promise<string> {
    const video = await this.getOwned(userId, id);
    if (!video.thumbnail_key) throw new VideoNotReadyException();
    return video.thumbnail_key;
  }
}

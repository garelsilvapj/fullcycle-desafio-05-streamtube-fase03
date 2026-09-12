import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { Video, VideoStatus } from './entities/video.entity';
import { Channel } from '../channels/entities/channel.entity';
import { CreateVideoDto } from './dto/create-video.dto';
import { StorageService } from '../storage/storage.service';
import { VideoQueueService } from '../queue/video-queue.service';
import {
  ChannelNotFoundException,
  VideoChannelForbiddenException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoUploadNotConfirmedException,
} from './video.exceptions';

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

  /** Registra o vídeo (status uploading) e devolve a URL pré-assinada de upload. */
  async register(userId: string, dto: CreateVideoDto) {
    const channel = await this.myChannel(userId);
    const id = randomUUID();
    const original_key = `videos/${channel.id}/${id}/original`;
    const video = this.repo.create({
      id,
      channel_id: channel.id,
      title: dto.title,
      description: dto.description ?? null,
      status: VideoStatus.UPLOADING,
      original_key,
    });
    await this.repo.save(video);
    const uploadUrl = await this.storage.createPresignedUpload(original_key);
    return { video, uploadUrl };
  }

  /** Confirma o upload: valida o objeto no storage, muda para uploaded e enfileira. */
  async confirmUpload(userId: string, id: string): Promise<Video> {
    const video = await this.getOwned(userId, id);
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
    if (video.channel_id !== channel.id)
      throw new VideoChannelForbiddenException();
    return video;
  }

  /** Retorna a chave streamável somente se o vídeo estiver pronto. */
  async readyKey(id: string): Promise<{ video: Video; key: string }> {
    const video = await this.get(id);
    if (video.status !== VideoStatus.READY || !video.processed_key) {
      throw new VideoNotReadyException();
    }
    return { video, key: video.processed_key };
  }
}

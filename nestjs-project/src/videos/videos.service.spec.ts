import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { VideosService } from './videos.service';
import { Video, VideoStatus } from './entities/video.entity';
import { Channel } from '../channels/entities/channel.entity';
import { StorageService } from '../storage/storage.service';
import { VideoQueueService } from '../queue/video-queue.service';
import {
  ChannelNotFoundException,
  VideoChannelForbiddenException,
  VideoNotReadyException,
  VideoUploadNotConfirmedException,
} from './video.exceptions';

describe('VideosService', () => {
  let service: VideosService;
  const videoRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findOne: jest.fn(),
    find: jest.fn(async () => []),
  };
  const channelRepo = { findOne: jest.fn() };
  const storage = {
    createPresignedUpload: jest.fn(async () => 'https://minio/presigned'),
    createPresignedDownload: jest.fn(async () => 'https://minio/download'),
    head: jest.fn(),
  };
  const queue = { enqueue: jest.fn() };

  const CH = { id: 'ch-1', user_id: 'user-1' } as Channel;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: getRepositoryToken(Video), useValue: videoRepo },
        { provide: getRepositoryToken(Channel), useValue: channelRepo },
        { provide: StorageService, useValue: storage },
        { provide: VideoQueueService, useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(VideosService);
  });

  describe('register', () => {
    it('cria vídeo uploading no canal do usuário e devolve uploadUrl', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      const out = await service.register('user-1', { title: 'Meu vídeo' });
      expect(out.uploadUrl).toBe('https://minio/presigned');
      expect(out.video.channel_id).toBe('ch-1');
      expect(out.video.status).toBe(VideoStatus.UPLOADING);
      expect(videoRepo.save).toHaveBeenCalled();
    });

    it('falha se o usuário não tem canal', async () => {
      channelRepo.findOne.mockResolvedValue(null);
      await expect(service.register('user-x', { title: 'x' })).rejects.toBeInstanceOf(
        ChannelNotFoundException,
      );
    });
  });

  describe('confirmUpload', () => {
    it('valida o objeto, marca uploaded e enfileira', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue({
        id: 'v-1',
        channel_id: 'ch-1',
        original_key: 'k',
        status: VideoStatus.UPLOADING,
      });
      storage.head.mockResolvedValue({ size: 1234 });
      const v = await service.confirmUpload('user-1', 'v-1');
      expect(v.status).toBe(VideoStatus.UPLOADED);
      expect(v.size_bytes).toBe('1234');
      expect(queue.enqueue).toHaveBeenCalledWith('v-1');
    });

    it('falha se o objeto não está no storage', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue({ id: 'v-1', channel_id: 'ch-1', original_key: 'k' });
      storage.head.mockResolvedValue(null);
      await expect(service.confirmUpload('user-1', 'v-1')).rejects.toBeInstanceOf(
        VideoUploadNotConfirmedException,
      );
    });
  });

  describe('getOwned', () => {
    it('bloqueia vídeo de outro canal', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue({ id: 'v-2', channel_id: 'ch-OUTRO' });
      await expect(service.getOwned('user-1', 'v-2')).rejects.toBeInstanceOf(
        VideoChannelForbiddenException,
      );
    });
  });

  describe('readyKey', () => {
    it('recusa vídeo que não está ready', async () => {
      videoRepo.findOne.mockResolvedValue({ id: 'v-3', status: VideoStatus.PROCESSING });
      await expect(service.readyKey('v-3')).rejects.toBeInstanceOf(VideoNotReadyException);
    });

    it('devolve a chave processada quando ready', async () => {
      videoRepo.findOne.mockResolvedValue({
        id: 'v-4',
        status: VideoStatus.READY,
        processed_key: 'videos/ch-1/v-4/processed.mp4',
      });
      const { key } = await service.readyKey('v-4');
      expect(key).toBe('videos/ch-1/v-4/processed.mp4');
    });
  });
});

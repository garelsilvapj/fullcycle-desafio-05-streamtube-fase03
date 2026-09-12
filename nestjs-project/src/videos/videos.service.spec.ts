import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';

import { VideosService } from './videos.service';
import { Video, VideoStatus } from './entities/video.entity';
import { Channel } from '../channels/entities/channel.entity';
import { StorageService } from '../storage/storage.service';
import { VideoQueueService } from '../queue/video-queue.service';
import { VIDEO_SLUG_PATTERN } from './slug.util';
import {
  ChannelNotFoundException,
  VideoChannelForbiddenException,
  VideoInvalidStateException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoUploadNotConfirmedException,
} from './video.exceptions';

function slugCollision(): QueryFailedError {
  const err = new QueryFailedError('INSERT', [], new Error('dup'));
  Object.assign(err, {
    code: '23505',
    detail: 'Key (slug)=(abc) already exists.',
  });
  return err;
}

describe('VideosService', () => {
  let service: VideosService;
  const videoRepo = {
    create: jest.fn((v: Partial<Video>) => v as Video),
    save: jest.fn((v: Video) => Promise.resolve(v)),
    remove: jest.fn((v: Video) => Promise.resolve(v)),
    findOne: jest.fn(),
    find: jest.fn(() => Promise.resolve([])),
  };
  const channelRepo = { findOne: jest.fn() };
  const storage = {
    createPresignedUpload: jest.fn(() =>
      Promise.resolve('https://minio/presigned'),
    ),
    createPresignedDownload: jest.fn(() =>
      Promise.resolve('https://minio/download'),
    ),
    head: jest.fn(),
    needsMultipart: jest.fn((n: number) => n > 100 * 1024 * 1024),
    createMultipartUpload: jest.fn(() =>
      Promise.resolve({
        uploadId: 'up-1',
        partSize: 100 * 1024 * 1024,
        parts: [
          { partNumber: 1, url: 'https://minio/part1' },
          { partNumber: 2, url: 'https://minio/part2' },
        ],
      }),
    ),
    completeMultipartUpload: jest.fn(() => Promise.resolve(undefined)),
    abortMultipartUpload: jest.fn(() => Promise.resolve(undefined)),
    deleteObjects: jest.fn(() => Promise.resolve(undefined)),
  };
  const queue = { enqueue: jest.fn() };

  const CH = { id: 'ch-1', user_id: 'user-1' } as Channel;
  const owned = (extra: Partial<Video>): Video =>
    ({
      id: 'v-1',
      channel_id: 'ch-1',
      original_key: 'videos/ch-1/v-1/original',
      status: VideoStatus.UPLOADING,
      processed_key: null,
      thumbnail_key: null,
      ...extra,
    }) as Video;

  beforeEach(async () => {
    jest.clearAllMocks();
    videoRepo.create.mockImplementation((v: Partial<Video>) => v as Video);
    videoRepo.save.mockImplementation((v: Video) => Promise.resolve(v));
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
    it('arquivo pequeno (ou sem tamanho) → upload single com URL e slug gerado', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      const out = await service.register('user-1', { title: 'Meu vídeo' });
      expect(out.upload.type).toBe('single');
      expect(out.upload).toHaveProperty('url', 'https://minio/presigned');
      expect(out.video.channel_id).toBe('ch-1');
      expect(out.video.status).toBe(VideoStatus.UPLOADING);
      expect(out.video.slug).toMatch(VIDEO_SLUG_PATTERN);
      expect(out.video.original_key).toBe(
        `videos/ch-1/${out.video.id}/original`,
      );
      expect(videoRepo.save).toHaveBeenCalledTimes(1);
    });

    it('arquivo grande (> threshold) → plano multipart com partes', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      const out = await service.register('user-1', {
        title: 'Vídeo 6GB',
        sizeBytes: 6 * 1024 * 1024 * 1024,
      });
      expect(out.upload.type).toBe('multipart');
      expect(out.upload).toHaveProperty('uploadId', 'up-1');
      expect((out.upload as { parts: unknown[] }).parts).toHaveLength(2);
      expect(storage.createMultipartUpload).toHaveBeenCalled();
    });

    it('falha se o usuário não tem canal (nada é persistido nem pré-assinado)', async () => {
      channelRepo.findOne.mockResolvedValue(null);
      await expect(
        service.register('user-x', { title: 'x' }),
      ).rejects.toBeInstanceOf(ChannelNotFoundException);
      expect(storage.createPresignedUpload).not.toHaveBeenCalled();
      expect(videoRepo.save).not.toHaveBeenCalled();
    });

    it('não persiste o vídeo se a pré-assinatura falhar', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      storage.createPresignedUpload.mockRejectedValueOnce(new Error('S3 down'));
      await expect(service.register('user-1', { title: 'x' })).rejects.toThrow(
        'S3 down',
      );
      expect(videoRepo.save).not.toHaveBeenCalled();
    });

    it('cancela o multipart no storage se a persistência falhar', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.save.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.register('user-1', { title: 'x', sizeBytes: 6e9 }),
      ).rejects.toThrow('db down');
      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
        expect.stringMatching(/\/original$/),
        'up-1',
      );
    });

    it('gera outro slug quando há colisão de unicidade', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.save
        .mockRejectedValueOnce(slugCollision())
        .mockImplementationOnce((v: Video) => Promise.resolve(v));
      const out = await service.register('user-1', { title: 'x' });
      expect(videoRepo.save).toHaveBeenCalledTimes(2);
      const slugs = videoRepo.create.mock.calls.map(([v]) => v.slug);
      expect(slugs[0]).not.toBe(slugs[1]);
      expect(out.video.slug).toBe(slugs[1]);
    });

    it('propaga erros de banco que não são colisão de slug', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.save.mockRejectedValueOnce(new Error('connection lost'));
      await expect(service.register('user-1', { title: 'x' })).rejects.toThrow(
        'connection lost',
      );
      expect(videoRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmUpload', () => {
    it('valida o objeto, marca uploaded com o tamanho e enfileira', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({}));
      storage.head.mockResolvedValue({ size: 1234 });
      const v = await service.confirmUpload('user-1', 'v-1');
      expect(v.status).toBe(VideoStatus.UPLOADED);
      expect(v.size_bytes).toBe('1234');
      expect(queue.enqueue).toHaveBeenCalledWith('v-1');
    });

    it('falha se o objeto não está no storage (e não enfileira)', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({}));
      storage.head.mockResolvedValue(null);
      await expect(
        service.confirmUpload('user-1', 'v-1'),
      ).rejects.toBeInstanceOf(VideoUploadNotConfirmedException);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it.each([
      VideoStatus.UPLOADED,
      VideoStatus.PROCESSING,
      VideoStatus.READY,
      VideoStatus.FAILED,
    ])('recusa reconfirmar um vídeo em %s', async (status) => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({ status }));
      await expect(
        service.confirmUpload('user-1', 'v-1'),
      ).rejects.toBeInstanceOf(VideoInvalidStateException);
      expect(storage.head).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('multipart complete/abort', () => {
    it('completeMultipart monta o objeto, marca uploaded e enfileira', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({}));
      storage.head.mockResolvedValue({ size: 6_000_000_000 });
      const v = await service.completeMultipart('user-1', 'v-1', 'up-1', [
        { partNumber: 1, etag: 'a' },
        { partNumber: 2, etag: 'b' },
      ]);
      expect(storage.completeMultipartUpload).toHaveBeenCalledWith(
        'videos/ch-1/v-1/original',
        'up-1',
        expect.any(Array),
      );
      expect(v.status).toBe(VideoStatus.UPLOADED);
      expect(queue.enqueue).toHaveBeenCalledWith('v-1');
    });

    it('completeMultipart recusa vídeo que não está em uploading', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({ status: VideoStatus.READY }));
      await expect(
        service.completeMultipart('user-1', 'v-1', 'up-1', []),
      ).rejects.toBeInstanceOf(VideoInvalidStateException);
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('abortMultipart cancela no storage e remove o registro', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      const video = owned({});
      videoRepo.findOne.mockResolvedValue(video);
      await service.abortMultipart('user-1', 'v-1', 'up-1');
      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
        'videos/ch-1/v-1/original',
        'up-1',
      );
      expect(videoRepo.remove).toHaveBeenCalledWith(video);
    });

    it('abortMultipart recusa vídeo já confirmado', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(
        owned({ status: VideoStatus.UPLOADED }),
      );
      await expect(
        service.abortMultipart('user-1', 'v-1', 'up-1'),
      ).rejects.toBeInstanceOf(VideoInvalidStateException);
      expect(videoRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('remove os objetos existentes do storage e depois a linha', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      const video = owned({
        status: VideoStatus.READY,
        processed_key: 'videos/ch-1/v-1/processed.mp4',
        thumbnail_key: 'videos/ch-1/v-1/thumb.jpg',
      });
      videoRepo.findOne.mockResolvedValue(video);
      await service.delete('user-1', 'v-1');
      expect(storage.deleteObjects).toHaveBeenCalledWith([
        'videos/ch-1/v-1/original',
        'videos/ch-1/v-1/processed.mp4',
        'videos/ch-1/v-1/thumb.jpg',
      ]);
      expect(videoRepo.remove).toHaveBeenCalledWith(video);
    });

    it('ignora chaves ausentes (vídeo ainda em uploading)', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({}));
      await service.delete('user-1', 'v-1');
      expect(storage.deleteObjects).toHaveBeenCalledWith([
        'videos/ch-1/v-1/original',
      ]);
    });

    it('recusa excluir vídeo em processamento', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(
        owned({ status: VideoStatus.PROCESSING }),
      );
      await expect(service.delete('user-1', 'v-1')).rejects.toBeInstanceOf(
        VideoInvalidStateException,
      );
      expect(storage.deleteObjects).not.toHaveBeenCalled();
      expect(videoRepo.remove).not.toHaveBeenCalled();
    });

    it('não remove a linha se o storage falhar', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({}));
      storage.deleteObjects.mockRejectedValueOnce(new Error('S3 down'));
      await expect(service.delete('user-1', 'v-1')).rejects.toThrow('S3 down');
      expect(videoRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('getOwned / get', () => {
    it('bloqueia vídeo de outro canal', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({ channel_id: 'ch-OUTRO' }));
      await expect(service.getOwned('user-1', 'v-1')).rejects.toBeInstanceOf(
        VideoChannelForbiddenException,
      );
    });

    it('404 para vídeo inexistente', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(null);
      await expect(service.getOwned('user-1', 'nope')).rejects.toBeInstanceOf(
        VideoNotFoundException,
      );
    });
  });

  describe('listMine', () => {
    it('lista pelo canal do usuário, mais recentes primeiro', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      await service.listMine('user-1');
      expect(videoRepo.find).toHaveBeenCalledWith({
        where: { channel_id: 'ch-1' },
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('readyKey / thumbnailKey', () => {
    it('recusa vídeo que não está ready', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(
        owned({ status: VideoStatus.PROCESSING }),
      );
      await expect(service.readyKey('user-1', 'v-1')).rejects.toBeInstanceOf(
        VideoNotReadyException,
      );
    });

    it('recusa vídeo de outro canal mesmo se ready', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(
        owned({
          channel_id: 'ch-OUTRO',
          status: VideoStatus.READY,
          processed_key: 'k',
        }),
      );
      await expect(service.readyKey('user-1', 'v-1')).rejects.toBeInstanceOf(
        VideoChannelForbiddenException,
      );
    });

    it('devolve a chave processada quando ready', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(
        owned({
          status: VideoStatus.READY,
          processed_key: 'videos/ch-1/v-1/processed.mp4',
        }),
      );
      const { key } = await service.readyKey('user-1', 'v-1');
      expect(key).toBe('videos/ch-1/v-1/processed.mp4');
    });

    it('thumbnailKey exige thumbnail gerada', async () => {
      channelRepo.findOne.mockResolvedValue(CH);
      videoRepo.findOne.mockResolvedValue(owned({}));
      await expect(
        service.thumbnailKey('user-1', 'v-1'),
      ).rejects.toBeInstanceOf(VideoNotReadyException);
      videoRepo.findOne.mockResolvedValue(owned({ thumbnail_key: 't.jpg' }));
      await expect(service.thumbnailKey('user-1', 'v-1')).resolves.toBe(
        't.jpg',
      );
    });
  });
});

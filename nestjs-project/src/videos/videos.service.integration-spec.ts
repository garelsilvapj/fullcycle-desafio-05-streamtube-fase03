import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import type { StorageService } from '../storage/storage.service';
import type { VideoQueueService } from '../queue/video-queue.service';
import { Video, VideoStatus } from './entities/video.entity';
import { VideosService } from './videos.service';
import { generateVideoSlug } from './slug.util';
import {
  VideoChannelForbiddenException,
  VideoInvalidStateException,
  VideoNotFoundException,
  VideoUploadNotConfirmedException,
} from './video.exceptions';

jest.mock('./slug.util', () => {
  const actual =
    jest.requireActual<typeof import('./slug.util')>('./slug.util');
  return { ...actual, generateVideoSlug: jest.fn(actual.generateVideoSlug) };
});

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];
const MiB = 1024 * 1024;

/** Storage em memória: só guarda quais chaves "existem" e seus tamanhos. */
class FakeStorage {
  objects = new Map<string, number>();
  aborted: string[] = [];
  needsMultipart = (size: number) => size > 100 * MiB;
  createPresignedUpload = (key: string) =>
    Promise.resolve(`http://s3/put/${key}`);
  createPresignedDownload = (key: string) =>
    Promise.resolve(`http://s3/get/${key}`);
  createMultipartUpload = (key: string, size: number) =>
    Promise.resolve({
      uploadId: `up-${key}`,
      partSize: 100 * MiB,
      parts: Array.from({ length: Math.ceil(size / (100 * MiB)) }, (_, i) => ({
        partNumber: i + 1,
        url: `http://s3/part/${i + 1}`,
      })),
    });
  completeMultipartUpload = (key: string) => {
    this.objects.set(key, 6 * 1024 * MiB);
    return Promise.resolve();
  };
  abortMultipartUpload = (key: string, uploadId: string) => {
    this.aborted.push(`${key}:${uploadId}`);
    return Promise.resolve();
  };
  head = (key: string) => {
    const size = this.objects.get(key);
    return Promise.resolve(size === undefined ? null : { size });
  };
  deleteObjects = (keys: string[]) => {
    keys.forEach((k) => this.objects.delete(k));
    return Promise.resolve();
  };
}

class FakeQueue {
  enqueued: string[] = [];
  enqueue = (id: string) => {
    this.enqueued.push(id);
    return Promise.resolve();
  };
}

describe('VideosService (integration)', () => {
  let dataSource: DataSource;
  let users: Repository<User>;
  let channels: Repository<Channel>;
  let videos: Repository<Video>;
  let storage: FakeStorage;
  let queue: FakeQueue;
  let service: VideosService;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES, { synchronize: false });
    await dataSource.initialize();
    users = dataSource.getRepository(User);
    channels = dataSource.getRepository(Channel);
    videos = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    storage = new FakeStorage();
    queue = new FakeQueue();
    service = new VideosService(
      videos,
      channels,
      storage as unknown as StorageService,
      queue as unknown as VideoQueueService,
    );
  });

  let counter = 0;
  async function createUserWithChannel(): Promise<{
    user: User;
    channel: Channel;
  }> {
    const n = ++counter;
    const user = await users.save(
      users.create({ email: `svc_user_${n}@example.com`, password: 'x' }),
    );
    const channel = await channels.save(
      channels.create({
        name: `c${n}`,
        nickname: `svcchan${n}`,
        user_id: user.id,
      }),
    );
    return { user, channel };
  }

  describe('register', () => {
    it('persists an uploading draft with slug and original_key under the channel prefix', async () => {
      const { user, channel } = await createUserWithChannel();
      const { video, upload } = await service.register(user.id, {
        title: 'Meu vídeo',
        description: 'desc',
      });

      const row = await videos.findOneByOrFail({ id: video.id });
      expect(row.status).toBe(VideoStatus.UPLOADING);
      expect(row.channel_id).toBe(channel.id);
      expect(row.slug).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(row.original_key).toBe(
        `videos/${channel.id}/${video.id}/original`,
      );
      expect(upload).toEqual({
        type: 'single',
        url: `http://s3/put/${row.original_key}`,
      });
    });

    it('recovers from a real slug collision by generating a new one', async () => {
      const { user } = await createUserWithChannel();
      const first = await service.register(user.id, { title: 'a' });
      const mocked = jest.mocked(generateVideoSlug);
      mocked.mockReturnValueOnce(first.video.slug);

      const second = await service.register(user.id, { title: 'b' });
      expect(second.video.slug).not.toBe(first.video.slug);
      expect(await videos.count()).toBe(2);
    });

    it('leaves nothing in the database when the user has no channel', async () => {
      const user = await users.save(
        users.create({ email: 'nochannel@example.com', password: 'x' }),
      );
      await expect(service.register(user.id, { title: 'x' })).rejects.toThrow();
      expect(await videos.count()).toBe(0);
    });
  });

  describe('confirm / complete / abort', () => {
    it('confirmUpload moves to uploaded with the object size and enqueues once', async () => {
      const { user } = await createUserWithChannel();
      const { video } = await service.register(user.id, { title: 'x' });
      storage.objects.set(video.original_key, 12345);

      const confirmed = await service.confirmUpload(user.id, video.id);
      const row = await videos.findOneByOrFail({ id: video.id });
      expect(confirmed.status).toBe(VideoStatus.UPLOADED);
      expect(row.status).toBe(VideoStatus.UPLOADED);
      expect(row.size_bytes).toBe('12345');
      expect(queue.enqueued).toEqual([video.id]);

      await expect(
        service.confirmUpload(user.id, video.id),
      ).rejects.toBeInstanceOf(VideoInvalidStateException);
      expect(queue.enqueued).toHaveLength(1);
    });

    it('confirmUpload without the object keeps the draft and enqueues nothing', async () => {
      const { user } = await createUserWithChannel();
      const { video } = await service.register(user.id, { title: 'x' });
      await expect(
        service.confirmUpload(user.id, video.id),
      ).rejects.toBeInstanceOf(VideoUploadNotConfirmedException);
      expect((await videos.findOneByOrFail({ id: video.id })).status).toBe(
        VideoStatus.UPLOADING,
      );
      expect(queue.enqueued).toEqual([]);
    });

    it('completeMultipart assembles the object, confirms and enqueues', async () => {
      const { user } = await createUserWithChannel();
      const { video, upload } = await service.register(user.id, {
        title: 'big',
        sizeBytes: 6 * 1024 * MiB,
      });
      expect(upload.type).toBe('multipart');
      const uploadId = (upload as { uploadId: string }).uploadId;

      const done = await service.completeMultipart(
        user.id,
        video.id,
        uploadId,
        [{ partNumber: 1, etag: 'a' }],
      );
      expect(done.status).toBe(VideoStatus.UPLOADED);
      expect(queue.enqueued).toEqual([video.id]);
    });

    it('abortMultipart aborts in storage and deletes the row', async () => {
      const { user } = await createUserWithChannel();
      const { video, upload } = await service.register(user.id, {
        title: 'big',
        sizeBytes: 6 * 1024 * MiB,
      });
      const uploadId = (upload as { uploadId: string }).uploadId;

      await service.abortMultipart(user.id, video.id, uploadId);
      expect(storage.aborted).toEqual([`${video.original_key}:${uploadId}`]);
      expect(await videos.findOneBy({ id: video.id })).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes storage objects and the row', async () => {
      const { user } = await createUserWithChannel();
      const { video } = await service.register(user.id, { title: 'x' });
      storage.objects.set(video.original_key, 10);
      await videos.update(video.id, {
        status: VideoStatus.READY,
        processed_key: 'p',
        thumbnail_key: 't',
      });
      storage.objects.set('p', 10);
      storage.objects.set('t', 10);

      await service.delete(user.id, video.id);
      expect(storage.objects.size).toBe(0);
      expect(await videos.findOneBy({ id: video.id })).toBeNull();
    });

    it('refuses while processing and keeps everything', async () => {
      const { user } = await createUserWithChannel();
      const { video } = await service.register(user.id, { title: 'x' });
      await videos.update(video.id, { status: VideoStatus.PROCESSING });
      await expect(service.delete(user.id, video.id)).rejects.toBeInstanceOf(
        VideoInvalidStateException,
      );
      expect(await videos.findOneBy({ id: video.id })).not.toBeNull();
    });
  });

  describe('ownership and listing', () => {
    it('isolates videos between channels and orders newest first', async () => {
      const a = await createUserWithChannel();
      const b = await createUserWithChannel();
      const v1 = await service.register(a.user.id, { title: 'a1' });
      await new Promise((r) => setTimeout(r, 5));
      const v2 = await service.register(a.user.id, { title: 'a2' });
      await service.register(b.user.id, { title: 'b1' });

      const mine = await service.listMine(a.user.id);
      expect(mine.map((v) => v.id)).toEqual([v2.video.id, v1.video.id]);
      expect(await service.listMine(b.user.id)).toHaveLength(1);
    });

    it('getOwned rejects another channel video and unknown ids', async () => {
      const a = await createUserWithChannel();
      const b = await createUserWithChannel();
      const { video } = await service.register(a.user.id, { title: 'a' });

      await expect(
        service.getOwned(b.user.id, video.id),
      ).rejects.toBeInstanceOf(VideoChannelForbiddenException);
      await expect(
        service.getOwned(a.user.id, '00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });
  });
});

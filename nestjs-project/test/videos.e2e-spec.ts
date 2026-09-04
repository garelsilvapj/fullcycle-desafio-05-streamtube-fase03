import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Readable } from 'stream';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { VideoQueueService } from '../src/queue/video-queue.service';
import { Video, VideoStatus } from '../src/videos/entities/video.entity';
import { cleanAllTables } from '../src/test/create-test-data-source';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Storage em memória com conteúdo real, para exercitar 200/206/416 do stream. */
class FakeStorage {
  objects = new Map<string, Buffer>();
  aborted: string[] = [];
  needsMultipart = (size: number) => size > 100 * MiB;
  createPresignedUpload = (key: string) =>
    Promise.resolve(`http://localhost:9000/put/${key}`);
  createPresignedDownload = (key: string) =>
    Promise.resolve(`http://localhost:9000/get/${key}`);
  createMultipartUpload = (key: string, size: number) =>
    Promise.resolve({
      uploadId: `up-${key}`,
      partSize: 100 * MiB,
      parts: Array.from({ length: Math.ceil(size / (100 * MiB)) }, (_, i) => ({
        partNumber: i + 1,
        url: `http://localhost:9000/part/${i + 1}`,
      })),
    });
  completeMultipartUpload = (key: string) => {
    this.objects.set(key, Buffer.alloc(16, 1));
    return Promise.resolve();
  };
  abortMultipartUpload = (key: string, uploadId: string) => {
    this.aborted.push(`${key}:${uploadId}`);
    return Promise.resolve();
  };
  head = (key: string) => {
    const obj = this.objects.get(key);
    return Promise.resolve(obj ? { size: obj.length } : null);
  };
  getObject = (key: string) => {
    const obj = this.objects.get(key) as Buffer;
    return Promise.resolve({
      stream: Readable.from(obj),
      contentLength: obj.length,
      contentType: 'video/mp4',
    });
  };
  getRange = (key: string, start: number, end: number) => {
    const obj = (this.objects.get(key) as Buffer).subarray(start, end + 1);
    return Promise.resolve({
      stream: Readable.from(obj),
      contentLength: obj.length,
      contentType: 'video/mp4',
    });
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

interface VideoBody {
  id: string;
  slug: string;
  title: string;
  status: VideoStatus;
  sizeBytes: number | null;
  thumbnailUrl: string | null;
  error?: string | null;
}
interface RegisterBody {
  video: VideoBody;
  upload:
    | { type: 'single'; url: string }
    | {
        type: 'multipart';
        uploadId: string;
        partSize: number;
        parts: unknown[];
      };
}
interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}
const body = <T>(res: request.Response): T => res.body as T;

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videos: Repository<Video>;
  let throttlerStorage: ThrottlerStorageService;
  let storage: FakeStorage;
  let queue: FakeQueue;

  beforeAll(async () => {
    storage = new FakeStorage();
    queue = new FakeQueue();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(VideoQueueService)
      .useValue(queue)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    videos = dataSource.getRepository(Video);
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
    storage.objects.clear();
    storage.aborted = [];
    queue.enqueued = [];
  });

  const http = () => request(app.getHttpServer());

  /** Registra, confirma o e-mail (token capturado do MailService) e loga: devolve o Bearer. */
  async function loginAs(email: string): Promise<string> {
    const password = 'password123';
    const authService = app.get(AuthService);
    const mailService = (authService as unknown as { mailService: object })
      .mailService;
    let token = '';
    jest
      .spyOn(
        mailService as {
          sendConfirmationEmail: (...a: string[]) => Promise<void>;
        },
        'sendConfirmationEmail',
      )
      .mockImplementationOnce((_e: string, _n: string, t: string) => {
        token = t;
        return Promise.resolve();
      });
    await http().post('/auth/register').send({ email, password }).expect(201);
    await http().get('/auth/confirm-email').query({ token }).expect(204);
    const res = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return body<{ access_token: string }>(res).access_token;
  }

  async function registerVideo(
    bearer: string,
    payload: Record<string, unknown> = { title: 'Meu vídeo' },
  ): Promise<RegisterBody> {
    const res = await http()
      .post('/videos')
      .set('Authorization', `Bearer ${bearer}`)
      .send(payload)
      .expect(201);
    return body<RegisterBody>(res);
  }

  async function originalKeyOf(id: string): Promise<string> {
    return (await videos.findOneByOrFail({ id })).original_key;
  }

  /** Simula o worker: grava o MP4 processado no storage fake e marca ready. */
  async function makeReady(
    id: string,
    bytes: number,
    withThumb = true,
  ): Promise<Buffer> {
    const row = await videos.findOneByOrFail({ id });
    const content = Buffer.from(
      Array.from({ length: bytes }, (_, i) => i % 256),
    );
    const processed_key = `videos/${row.channel_id}/${id}/processed.mp4`;
    const thumbnail_key = `videos/${row.channel_id}/${id}/thumb.jpg`;
    storage.objects.set(processed_key, content);
    if (withThumb) storage.objects.set(thumbnail_key, Buffer.alloc(3));
    await videos.update(id, {
      status: VideoStatus.READY,
      processed_key,
      thumbnail_key: withThumb ? thumbnail_key : null,
      duration_sec: 8,
      size_bytes: String(bytes),
    });
    return content;
  }

  describe('authentication', () => {
    it('rejects every route without a bearer token', async () => {
      await http().get('/videos').expect(401);
      await http().post('/videos').send({ title: 'x' }).expect(401);
      await http().get(`/videos/${NIL_UUID}/stream`).expect(401);
      await http().delete(`/videos/${NIL_UUID}`).expect(401);
    });
  });

  describe('POST /videos', () => {
    it('creates an uploading draft with a single presigned URL and no storage keys in the body', async () => {
      const bearer = await loginAs('owner@example.com');
      const res = await registerVideo(bearer, {
        title: 'Meu vídeo',
        description: 'd',
        sizeBytes: 50 * MiB,
      });

      expect(res.video).toMatchObject({
        title: 'Meu vídeo',
        status: 'uploading',
        sizeBytes: null,
        thumbnailUrl: null,
        error: null,
      });
      expect(res.video.slug).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(res.upload.type).toBe('single');
      // a URL pré-assinada contém a chave por natureza; o DTO do vídeo, nunca
      expect(JSON.stringify(res.video)).not.toMatch(/_key|videos\//);
      expect(await videos.countBy({ id: res.video.id })).toBe(1);
    });

    it('returns a multipart plan above the threshold', async () => {
      const bearer = await loginAs('owner@example.com');
      const res = await registerVideo(bearer, {
        title: 'big',
        sizeBytes: 250 * MiB,
      });
      expect(res.upload.type).toBe('multipart');
      const plan = res.upload as {
        uploadId: string;
        partSize: number;
        parts: unknown[];
      };
      expect(plan.uploadId).toBeDefined();
      expect(plan.parts).toHaveLength(3);
    });

    it.each([
      [{ title: '' }, 'title'],
      [{ title: 'x', sizeBytes: 10 * GiB + 1 }, 'sizeBytes'],
      [{ title: 'x', sizeBytes: 0 }, 'sizeBytes'],
      [{ title: 'x', extra: true }, 'extra'],
    ])(
      'rejects invalid payload %j with VALIDATION_ERROR',
      async (payload, field) => {
        const bearer = await loginAs('owner@example.com');
        const res = await http()
          .post('/videos')
          .set('Authorization', `Bearer ${bearer}`)
          .send(payload)
          .expect(400);
        const err = body<ErrorBody>(res);
        expect(err.error).toBe('VALIDATION_ERROR');
        expect(JSON.stringify(err.message)).toContain(field);
      },
    );
  });

  describe('confirm and multipart', () => {
    it('409 VIDEO_UPLOAD_NOT_CONFIRMED when the object is missing, then 200 uploaded and one enqueue', async () => {
      const bearer = await loginAs('owner@example.com');
      const { video } = await registerVideo(bearer);

      const missing = await http()
        .post(`/videos/${video.id}/confirm`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(409);
      expect(body<ErrorBody>(missing).error).toBe('VIDEO_UPLOAD_NOT_CONFIRMED');
      expect(queue.enqueued).toEqual([]);

      storage.objects.set(await originalKeyOf(video.id), Buffer.alloc(1234));
      const ok = await http()
        .post(`/videos/${video.id}/confirm`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(200);
      expect(body<VideoBody>(ok)).toMatchObject({
        status: 'uploaded',
        sizeBytes: 1234,
      });
      expect(queue.enqueued).toEqual([video.id]);

      const again = await http()
        .post(`/videos/${video.id}/confirm`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(409);
      expect(body<ErrorBody>(again).error).toBe('VIDEO_INVALID_STATE');
      expect(queue.enqueued).toHaveLength(1);
    });

    it('multipart complete validates the body, then confirms; abort removes the draft', async () => {
      const bearer = await loginAs('owner@example.com');
      const { video, upload } = await registerVideo(bearer, {
        title: 'big',
        sizeBytes: 250 * MiB,
      });
      const uploadId = (upload as { uploadId: string }).uploadId;

      const bad = await http()
        .post(`/videos/${video.id}/multipart/complete`)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ uploadId, parts: [{ partNumber: 0 }] })
        .expect(400);
      expect(body<ErrorBody>(bad).error).toBe('VALIDATION_ERROR');

      const other = await registerVideo(bearer, {
        title: 'to abort',
        sizeBytes: 250 * MiB,
      });
      await http()
        .post(`/videos/${other.video.id}/multipart/abort`)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ uploadId: (other.upload as { uploadId: string }).uploadId })
        .expect(204);
      expect(storage.aborted).toHaveLength(1);
      await http()
        .get(`/videos/${other.video.id}`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(404);

      const done = await http()
        .post(`/videos/${video.id}/multipart/complete`)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ uploadId, parts: [{ partNumber: 1, etag: '"a"' }] })
        .expect(200);
      expect(body<VideoBody>(done).status).toBe('uploaded');
      expect(queue.enqueued).toEqual([video.id]);

      const abortAfter = await http()
        .post(`/videos/${video.id}/multipart/abort`)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ uploadId })
        .expect(409);
      expect(body<ErrorBody>(abortAfter).error).toBe('VIDEO_INVALID_STATE');
    });
  });

  describe('ownership and lookup', () => {
    it('another user gets 403 on read, confirm and delete; unknown id gets 404; bad id gets 400', async () => {
      const owner = await loginAs('owner@example.com');
      const intruder = await loginAs('intruder@example.com');
      const { video } = await registerVideo(owner);

      const calls = [
        () => http().get(`/videos/${video.id}`),
        () => http().post(`/videos/${video.id}/confirm`),
        () => http().delete(`/videos/${video.id}`),
        () => http().get(`/videos/${video.id}/stream`),
      ];
      for (const call of calls) {
        const res = await call()
          .set('Authorization', `Bearer ${intruder}`)
          .expect(403);
        expect(body<ErrorBody>(res).error).toBe('VIDEO_CHANNEL_FORBIDDEN');
      }

      const notFound = await http()
        .get(`/videos/${NIL_UUID}`)
        .set('Authorization', `Bearer ${owner}`)
        .expect(404);
      expect(body<ErrorBody>(notFound).error).toBe('VIDEO_NOT_FOUND');

      const badId = await http()
        .get('/videos/not-a-uuid')
        .set('Authorization', `Bearer ${owner}`)
        .expect(400);
      expect(body<ErrorBody>(badId).error).toBe('VALIDATION_ERROR');
    });

    it('GET /videos lists only my videos, newest first', async () => {
      const owner = await loginAs('owner@example.com');
      const other = await loginAs('other@example.com');
      const first = await registerVideo(owner, { title: 'first' });
      const second = await registerVideo(owner, { title: 'second' });
      await registerVideo(other, { title: 'not mine' });

      const res = await http()
        .get('/videos')
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
      const list = body<VideoBody[]>(res);
      expect(list.map((v) => v.id)).toEqual([second.video.id, first.video.id]);
    });
  });

  describe('stream, download and thumbnail', () => {
    it('409 VIDEO_NOT_READY before processing for stream, download and thumbnail', async () => {
      const bearer = await loginAs('owner@example.com');
      const { video } = await registerVideo(bearer);
      for (const path of ['stream', 'download', 'thumbnail']) {
        const res = await http()
          .get(`/videos/${video.id}/${path}`)
          .set('Authorization', `Bearer ${bearer}`)
          .expect(409);
        expect(body<ErrorBody>(res).error).toBe('VIDEO_NOT_READY');
      }
    });

    it('serves the whole file (200) and honours Range (206) with correct headers and bytes', async () => {
      const bearer = await loginAs('owner@example.com');
      const { video } = await registerVideo(bearer);
      const content = await makeReady(video.id, 4096);

      const full = await http()
        .get(`/videos/${video.id}/stream`)
        .set('Authorization', `Bearer ${bearer}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(full.headers['content-type']).toBe('video/mp4');
      expect(full.headers['accept-ranges']).toBe('bytes');
      expect(full.headers['content-length']).toBe('4096');
      expect(full.body as Buffer).toEqual(content);

      const partial = await http()
        .get(`/videos/${video.id}/stream`)
        .set('Authorization', `Bearer ${bearer}`)
        .set('Range', 'bytes=100-355')
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(206);
      expect(partial.headers['content-range']).toBe('bytes 100-355/4096');
      expect(partial.headers['content-length']).toBe('256');
      expect(partial.body as Buffer).toEqual(content.subarray(100, 356));

      const open = await http()
        .get(`/videos/${video.id}/stream`)
        .set('Authorization', `Bearer ${bearer}`)
        .set('Range', 'bytes=4000-')
        .expect(206);
      expect(open.headers['content-range']).toBe('bytes 4000-4095/4096');
    });

    it('416 VIDEO_INVALID_RANGE with Content-Range */total for unsatisfiable ranges', async () => {
      const bearer = await loginAs('owner@example.com');
      const { video } = await registerVideo(bearer);
      await makeReady(video.id, 2048);

      for (const range of ['bytes=5000-', 'bytes=300-100', 'items=0-1']) {
        const res = await http()
          .get(`/videos/${video.id}/stream`)
          .set('Authorization', `Bearer ${bearer}`)
          .set('Range', range)
          .expect(416);
        expect(body<ErrorBody>(res).error).toBe('VIDEO_INVALID_RANGE');
        expect(res.headers['content-range']).toBe('bytes */2048');
      }
    });

    it('download and thumbnail redirect (302) to presigned URLs; GET exposes thumbnailUrl', async () => {
      const bearer = await loginAs('owner@example.com');
      const { video } = await registerVideo(bearer);
      await makeReady(video.id, 64);

      const dl = await http()
        .get(`/videos/${video.id}/download`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(302);
      expect(dl.headers['location']).toMatch(
        /^http:\/\/localhost:9000\/get\/videos\//,
      );

      const th = await http()
        .get(`/videos/${video.id}/thumbnail`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(302);
      expect(th.headers['location']).toContain('thumb.jpg');

      const meta = await http()
        .get(`/videos/${video.id}`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(200);
      expect(body<VideoBody>(meta)).toMatchObject({
        status: 'ready',
        sizeBytes: 64,
        thumbnailUrl: `/videos/${video.id}/thumbnail`,
      });
      expect(JSON.stringify(meta.body)).not.toMatch(/_key|processed\.mp4/);
    });
  });

  describe('DELETE /videos/:id', () => {
    it('removes storage objects and the record; 404 afterwards', async () => {
      const bearer = await loginAs('owner@example.com');
      const { video } = await registerVideo(bearer);
      storage.objects.set(await originalKeyOf(video.id), Buffer.alloc(10));
      await makeReady(video.id, 32);
      expect(storage.objects.size).toBe(3);

      await http()
        .delete(`/videos/${video.id}`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(204);
      expect(storage.objects.size).toBe(0);
      await http()
        .get(`/videos/${video.id}`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(404);
    });

    it('409 VIDEO_INVALID_STATE while processing', async () => {
      const bearer = await loginAs('owner@example.com');
      const { video } = await registerVideo(bearer);
      await videos.update(video.id, { status: VideoStatus.PROCESSING });
      const res = await http()
        .delete(`/videos/${video.id}`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(409);
      expect(body<ErrorBody>(res).error).toBe('VIDEO_INVALID_STATE');
    });
  });
});

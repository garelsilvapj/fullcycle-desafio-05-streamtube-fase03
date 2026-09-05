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

class FakeStorage {
  objects = new Map<string, Buffer>();
  needsMultipart = () => false;
  createPresignedUpload = (key: string) =>
    Promise.resolve(`http://localhost:9000/put/${key}`);
  createPresignedDownload = (key: string) =>
    Promise.resolve(`http://localhost:9000/get/${key}`);
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
  abortMultipartUpload = () => Promise.resolve();
  completeMultipartUpload = () => Promise.resolve();
  createMultipartUpload = () => Promise.reject(new Error('unused'));
}

interface VideoBody {
  id: string;
  slug: string;
  title: string;
  viewsCount: number;
  visibility: string;
  channel?: { nickname: string };
  category: { id: string } | null;
}
const body = <T>(res: request.Response): T => res.body as T;

describe('Watch (e2e, Fase 05 — acesso público)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videos: Repository<Video>;
  let throttlerStorage: ThrottlerStorageService;
  let storage: FakeStorage;

  beforeAll(async () => {
    storage = new FakeStorage();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(VideoQueueService)
      .useValue({ enqueue: () => Promise.resolve() })
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
  });

  const http = () => request(app.getHttpServer());
  const auth = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });

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

  async function createReady(
    bearer: string,
    title: string,
    opts: {
      publish?: boolean;
      visibility?: 'public' | 'unlisted';
      categoryId?: string | null;
    } = {},
  ): Promise<VideoBody> {
    const created = body<{ video: VideoBody }>(
      await http()
        .post('/videos')
        .set(auth(bearer))
        .send({ title })
        .expect(201),
    ).video;
    const row = await videos.findOneByOrFail({ id: created.id });
    const prefix = `videos/${row.channel_id}/${created.id}`;
    storage.objects.set(`${prefix}/processed.mp4`, Buffer.alloc(2048, 1));
    storage.objects.set(`${prefix}/thumb.jpg`, Buffer.alloc(3));
    await videos.update(created.id, {
      status: VideoStatus.READY,
      processed_key: `${prefix}/processed.mp4`,
      thumbnail_key: `${prefix}/thumb.jpg`,
      size_bytes: '2048',
      duration_sec: 8,
    });
    if (opts.visibility || opts.categoryId !== undefined) {
      await http()
        .patch(`/videos/${created.id}`)
        .set(auth(bearer))
        .send({
          ...(opts.visibility && { visibility: opts.visibility }),
          ...(opts.categoryId !== undefined && { categoryId: opts.categoryId }),
        })
        .expect(200);
    }
    if (opts.publish)
      await http()
        .post(`/videos/${created.id}/publish`)
        .set(auth(bearer))
        .expect(200);
    return body<VideoBody>(
      await http().get(`/videos/${created.id}`).set(auth(bearer)).expect(200),
    );
  }

  it('GET /videos/slug/:slug is public for published videos (public and unlisted) and 404 otherwise', async () => {
    const owner = await loginAs('owner@example.com');
    const other = await loginAs('other@example.com');
    const pub = await createReady(owner, 'pub', { publish: true });
    const unlisted = await createReady(owner, 'unlisted', {
      publish: true,
      visibility: 'unlisted',
    });
    const draft = await createReady(owner, 'draft');

    const anon = body<VideoBody>(
      await http().get(`/videos/slug/${pub.slug}`).expect(200),
    );
    expect(anon).toMatchObject({ id: pub.id, channel: { nickname: 'owner' } });
    expect(anon).not.toHaveProperty('error');
    await http().get(`/videos/slug/${unlisted.slug}`).expect(200);

    await http().get(`/videos/slug/${draft.slug}`).expect(404);
    await http().get(`/videos/slug/${draft.slug}`).set(auth(other)).expect(404);
    await http().get(`/videos/slug/${draft.slug}`).set(auth(owner)).expect(200);
    await http().get('/videos/slug/naoexiste0').expect(404);
  });

  it('stream, download and thumbnail are public for published videos; drafts stay owner-only (404)', async () => {
    const owner = await loginAs('owner@example.com');
    const pub = await createReady(owner, 'pub', { publish: true });
    const draft = await createReady(owner, 'draft');

    const partial = await http()
      .get(`/videos/${pub.id}/stream`)
      .set('Range', 'bytes=0-99')
      .expect(206);
    expect(partial.headers['content-range']).toBe('bytes 0-99/2048');
    const dl = await http().get(`/videos/${pub.id}/download`).expect(302);
    expect(dl.headers['location']).toContain('processed.mp4');
    await http().get(`/videos/${pub.id}/thumbnail`).expect(302);

    await http().get(`/videos/${draft.id}/stream`).expect(404);
    await http().get(`/videos/${draft.id}/download`).expect(404);
    await http()
      .get(`/videos/${draft.id}/stream`)
      .set(auth(owner))
      .set('Range', 'bytes=0-9')
      .expect(206);
  });

  it('POST /videos/:id/views increments atomically for published videos only', async () => {
    const owner = await loginAs('owner@example.com');
    const pub = await createReady(owner, 'pub', { publish: true });
    const draft = await createReady(owner, 'draft');

    await Promise.all(
      [1, 2, 3].map(() => http().post(`/videos/${pub.id}/views`).expect(204)),
    );
    const after = body<VideoBody>(
      await http().get(`/videos/slug/${pub.slug}`).expect(200),
    );
    expect(after.viewsCount).toBe(3);
    await http().post(`/videos/${draft.id}/views`).expect(404);
  });

  it('GET /videos/:id/related prefers the same category and falls back to recent public videos', async () => {
    const owner = await loginAs('owner@example.com');
    const categories = body<{ id: string }[]>(
      await http().get('/categories').expect(200),
    );
    const [catA, catB] = categories;
    const main = await createReady(owner, 'main', {
      publish: true,
      categoryId: catA.id,
    });
    const sameCat = await createReady(owner, 'same', {
      publish: true,
      categoryId: catA.id,
    });
    const otherCat = await createReady(owner, 'other', {
      publish: true,
      categoryId: catB.id,
    });
    await createReady(owner, 'unlisted', {
      publish: true,
      visibility: 'unlisted',
      categoryId: catA.id,
    });
    await createReady(owner, 'draft', { categoryId: catA.id });

    const related = body<VideoBody[]>(
      await http().get(`/videos/${main.id}/related?limit=5`).expect(200),
    );
    expect(related.map((v) => v.id)).toEqual([sameCat.id, otherCat.id]);
    expect(related.every((v) => v.id !== main.id)).toBe(true);

    const two = body<VideoBody[]>(
      await http().get(`/videos/${main.id}/related?limit=1`).expect(200),
    );
    expect(two).toHaveLength(1);
    await http().get(`/videos/${main.id}/related?limit=99`).expect(400);
  });
});

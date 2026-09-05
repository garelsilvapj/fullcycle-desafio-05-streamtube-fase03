import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { VideoQueueService } from '../src/queue/video-queue.service';
import { Video, VideoStatus } from '../src/videos/entities/video.entity';
import { cleanAllTables } from '../src/test/create-test-data-source';

/** Storage em memória só com tamanhos (o fluxo de thumbnail precisa de head/delete). */
class FakeStorage {
  objects = new Map<string, number>();
  needsMultipart = () => false;
  createPresignedUpload = (key: string, contentType?: string) =>
    Promise.resolve(`http://localhost:9000/put/${key}?ct=${contentType ?? ''}`);
  createPresignedDownload = (key: string) =>
    Promise.resolve(`http://localhost:9000/get/${key}`);
  head = (key: string) => {
    const size = this.objects.get(key);
    return Promise.resolve(size === undefined ? null : { size });
  };
  deleteObjects = (keys: string[]) => {
    keys.forEach((k) => this.objects.delete(k));
    return Promise.resolve();
  };
  abortMultipartUpload = () => Promise.resolve();
  completeMultipartUpload = () => Promise.resolve();
  createMultipartUpload = () => Promise.reject(new Error('unused'));
}
class FakeQueue {
  enqueue = () => Promise.resolve();
}

interface VideoBody {
  id: string;
  title: string;
  status: string;
  visibility: string;
  isPublished: boolean;
  publishedAt: string | null;
  category: { id: string; slug: string } | null;
  thumbnailUrl: string | null;
  hasCustomThumbnail: boolean;
  viewsCount: number;
  channel?: { nickname: string };
}
interface ErrorBody {
  error: string;
}
const body = <T>(res: request.Response): T => res.body as T;

describe('Videos management (e2e, Fase 04)', () => {
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
      .useValue(new FakeQueue())
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

  async function createVideo(bearer: string, title = 'Vídeo'): Promise<string> {
    const res = await http()
      .post('/videos')
      .set(auth(bearer))
      .send({ title })
      .expect(201);
    return body<{ video: { id: string } }>(res).video.id;
  }

  /** Simula o worker: marca ready com thumbnail gerada. */
  async function makeReady(id: string): Promise<void> {
    const row = await videos.findOneByOrFail({ id });
    const prefix = `videos/${row.channel_id}/${id}`;
    storage.objects.set(`${prefix}/processed.mp4`, 100);
    storage.objects.set(`${prefix}/thumb.jpg`, 10);
    await videos.update(id, {
      status: VideoStatus.READY,
      processed_key: `${prefix}/processed.mp4`,
      thumbnail_key: `${prefix}/thumb.jpg`,
      size_bytes: '100',
      duration_sec: 8,
    });
  }

  async function firstCategory(): Promise<{ id: string; slug: string }> {
    const res = await http().get('/categories').expect(200);
    return body<{ id: string; slug: string }[]>(res)[0];
  }

  describe('PATCH /videos/:id', () => {
    it('edits title, description, visibility and category; null clears', async () => {
      const bearer = await loginAs('owner@example.com');
      const id = await createVideo(bearer);
      const category = await firstCategory();

      const res = await http()
        .patch(`/videos/${id}`)
        .set(auth(bearer))
        .send({
          title: 'Editado',
          description: 'desc',
          visibility: 'unlisted',
          categoryId: category.id,
        })
        .expect(200);
      expect(body<VideoBody>(res)).toMatchObject({
        title: 'Editado',
        visibility: 'unlisted',
        category: { id: category.id, slug: category.slug },
      });

      const cleared = await http()
        .patch(`/videos/${id}`)
        .set(auth(bearer))
        .send({ description: null, categoryId: null })
        .expect(200);
      expect(body<VideoBody>(cleared).category).toBeNull();
    });

    it.each([
      [{ title: '' }],
      [{ visibility: 'private' }],
      [{ categoryId: 'not-a-uuid' }],
      [{ status: 'ready' }],
    ])('rejects invalid payload %j', async (payload) => {
      const bearer = await loginAs('owner@example.com');
      const id = await createVideo(bearer);
      const res = await http()
        .patch(`/videos/${id}`)
        .set(auth(bearer))
        .send(payload)
        .expect(400);
      expect(body<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });

    it('returns 404 CATEGORY_NOT_FOUND for an unknown category and 403 for another user', async () => {
      const bearer = await loginAs('owner@example.com');
      const other = await loginAs('other@example.com');
      const id = await createVideo(bearer);
      const nf = await http()
        .patch(`/videos/${id}`)
        .set(auth(bearer))
        .send({ categoryId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
      expect(body<ErrorBody>(nf).error).toBe('CATEGORY_NOT_FOUND');
      await http()
        .patch(`/videos/${id}`)
        .set(auth(other))
        .send({ title: 'x' })
        .expect(403);
    });
  });

  describe('publish / unpublish', () => {
    it('409 VIDEO_NOT_PUBLISHABLE before ready; then publishes (idempotent) and unpublishes', async () => {
      const bearer = await loginAs('owner@example.com');
      const id = await createVideo(bearer);
      const early = await http()
        .post(`/videos/${id}/publish`)
        .set(auth(bearer))
        .expect(409);
      expect(body<ErrorBody>(early).error).toBe('VIDEO_NOT_PUBLISHABLE');

      await makeReady(id);
      const first = body<VideoBody>(
        await http()
          .post(`/videos/${id}/publish`)
          .set(auth(bearer))
          .expect(200),
      );
      expect(first.isPublished).toBe(true);
      const again = body<VideoBody>(
        await http()
          .post(`/videos/${id}/publish`)
          .set(auth(bearer))
          .expect(200),
      );
      expect(again.publishedAt).toBe(first.publishedAt);

      const un = body<VideoBody>(
        await http()
          .post(`/videos/${id}/unpublish`)
          .set(auth(bearer))
          .expect(200),
      );
      expect(un.isPublished).toBe(false);
      expect(un.publishedAt).toBeNull();
    });
  });

  describe('GET /videos (painel paginado)', () => {
    it('paginates and filters by status and published', async () => {
      const bearer = await loginAs('owner@example.com');
      const ids: string[] = [];
      for (const t of ['a', 'b', 'c']) ids.push(await createVideo(bearer, t));
      await makeReady(ids[0]);
      await http()
        .post(`/videos/${ids[0]}/publish`)
        .set(auth(bearer))
        .expect(200);

      const page = body<{
        items: VideoBody[];
        total: number;
        page: number;
        limit: number;
      }>(
        await http()
          .get('/videos?page=1&limit=2')
          .set(auth(bearer))
          .expect(200),
      );
      expect(page.items).toHaveLength(2);
      expect(page).toMatchObject({ total: 3, page: 1, limit: 2 });

      const ready = body<{ items: VideoBody[] }>(
        await http().get('/videos?status=ready').set(auth(bearer)).expect(200),
      );
      expect(ready.items.map((v) => v.id)).toEqual([ids[0]]);

      const drafts = body<{ items: VideoBody[] }>(
        await http()
          .get('/videos?published=false')
          .set(auth(bearer))
          .expect(200),
      );
      expect(drafts.items).toHaveLength(2);

      await http().get('/videos?limit=500').set(auth(bearer)).expect(400);
      await http().get('/videos?status=weird').set(auth(bearer)).expect(400);
    });
  });

  describe('thumbnail custom', () => {
    it('upload → confirm → served; too large → 400; delete → generated again', async () => {
      const bearer = await loginAs('owner@example.com');
      const id = await createVideo(bearer);
      await makeReady(id);
      const row = await videos.findOneByOrFail({ id });
      const customKey = `videos/${row.channel_id}/${id}/thumb-custom`;

      const plan = body<{ url: string }>(
        await http()
          .post(`/videos/${id}/thumbnail`)
          .set(auth(bearer))
          .send({ contentType: 'image/png' })
          .expect(200),
      );
      expect(plan.url).toContain(customKey);
      await http()
        .post(`/videos/${id}/thumbnail`)
        .set(auth(bearer))
        .send({ contentType: 'image/gif' })
        .expect(400);

      const missing = await http()
        .post(`/videos/${id}/thumbnail/confirm`)
        .set(auth(bearer))
        .expect(400);
      expect(body<ErrorBody>(missing).error).toBe('VIDEO_THUMBNAIL_INVALID');

      storage.objects.set(customKey, 6 * 1024 * 1024);
      await http()
        .post(`/videos/${id}/thumbnail/confirm`)
        .set(auth(bearer))
        .expect(400);
      expect(storage.objects.has(customKey)).toBe(false);

      storage.objects.set(customKey, 2048);
      const confirmed = body<VideoBody>(
        await http()
          .post(`/videos/${id}/thumbnail/confirm`)
          .set(auth(bearer))
          .expect(200),
      );
      expect(confirmed.hasCustomThumbnail).toBe(true);
      const served = await http()
        .get(`/videos/${id}/thumbnail`)
        .set(auth(bearer))
        .expect(302);
      expect(served.headers['location']).toContain(customKey);

      const removed = body<VideoBody>(
        await http()
          .delete(`/videos/${id}/thumbnail`)
          .set(auth(bearer))
          .expect(200),
      );
      expect(removed.hasCustomThumbnail).toBe(false);
      expect(storage.objects.has(customKey)).toBe(false);
      const generated = await http()
        .get(`/videos/${id}/thumbnail`)
        .set(auth(bearer))
        .expect(302);
      expect(generated.headers['location']).toContain('thumb.jpg');
    });
  });

  describe('public access (channel page)', () => {
    it('thumbnail is 404 for anonymous/others on drafts and 302 after publishing; channel listing shows only public published videos', async () => {
      const bearer = await loginAs('owner@example.com');
      const other = await loginAs('other@example.com');
      const draft = await createVideo(bearer, 'draft');
      const unlisted = await createVideo(bearer, 'unlisted');
      const published = await createVideo(bearer, 'published');
      for (const id of [draft, unlisted, published]) await makeReady(id);

      await http().get(`/videos/${draft}/thumbnail`).expect(404);
      await http()
        .get(`/videos/${draft}/thumbnail`)
        .set(auth(other))
        .expect(404);
      await http()
        .get(`/videos/${draft}/thumbnail`)
        .set(auth(bearer))
        .expect(302);

      await http()
        .post(`/videos/${published}/publish`)
        .set(auth(bearer))
        .expect(200);
      await http()
        .patch(`/videos/${unlisted}`)
        .set(auth(bearer))
        .send({ visibility: 'unlisted' })
        .expect(200);
      await http()
        .post(`/videos/${unlisted}/publish`)
        .set(auth(bearer))
        .expect(200);

      await http().get(`/videos/${published}/thumbnail`).expect(302);
      await http().get(`/videos/${unlisted}/thumbnail`).expect(302);

      const channel = body<{ nickname: string; videosCount: number }>(
        await http().get('/channels/owner').expect(200),
      );
      expect(channel.videosCount).toBe(1);

      const list = body<{ items: VideoBody[]; total: number }>(
        await http().get('/channels/owner/videos').expect(200),
      );
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({
        id: published,
        isPublished: true,
        channel: { nickname: 'owner' },
      });
      expect(list.items[0]).not.toHaveProperty('error');
      expect(JSON.stringify(list)).not.toMatch(/_key/);
    });
  });
});

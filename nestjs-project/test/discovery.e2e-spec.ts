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

class FakeStorage {
  needsMultipart = () => false;
  createPresignedUpload = (key: string) =>
    Promise.resolve(`http://localhost:9000/put/${key}`);
  createPresignedDownload = (key: string) =>
    Promise.resolve(`http://localhost:9000/get/${key}`);
  head = () => Promise.resolve({ size: 10 });
  deleteObjects = () => Promise.resolve();
  abortMultipartUpload = () => Promise.resolve();
  completeMultipartUpload = () => Promise.resolve();
  createMultipartUpload = () => Promise.reject(new Error('unused'));
}

interface Item {
  id: string;
  title: string;
  channel?: { nickname: string };
  category: { slug: string } | null;
}
interface Page {
  items: Item[];
  total: number;
  page: number;
  limit: number;
}
const body = <T>(res: request.Response): T => res.body as T;

describe('Discovery (e2e, Fase 07 — feed e busca)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videos: Repository<Video>;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(new FakeStorage())
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

  async function publish(
    bearer: string,
    title: string,
    opts: {
      categoryId?: string;
      visibility?: 'public' | 'unlisted';
      draft?: boolean;
      notReady?: boolean;
    } = {},
  ): Promise<string> {
    const id = body<{ video: { id: string } }>(
      await http()
        .post('/videos')
        .set(auth(bearer))
        .send({ title })
        .expect(201),
    ).video.id;
    if (!opts.notReady) {
      await videos.update(id, {
        status: VideoStatus.READY,
        processed_key: 'p',
        thumbnail_key: 't',
        size_bytes: '10',
        duration_sec: 1,
      });
    }
    if (opts.categoryId || opts.visibility) {
      await http()
        .patch(`/videos/${id}`)
        .set(auth(bearer))
        .send({
          ...(opts.categoryId && { categoryId: opts.categoryId }),
          ...(opts.visibility && { visibility: opts.visibility }),
        })
        .expect(200);
    }
    if (!opts.draft && !opts.notReady)
      await http().post(`/videos/${id}/publish`).set(auth(bearer)).expect(200);
    await new Promise((r) => setTimeout(r, 5)); // ordena por published_at
    return id;
  }

  it('GET /feed lists only public published ready videos, newest first, with channel and category; filters by category', async () => {
    const alice = await loginAs('alice@example.com');
    const [games, music] = body<{ id: string; slug: string }[]>(
      await http().get('/categories').expect(200),
    ).filter((c) => ['games', 'musica'].includes(c.slug));
    const older = await publish(alice, 'Gameplay antiga', {
      categoryId: games.id,
    });
    const newer = await publish(alice, 'Show ao vivo', {
      categoryId: music.id,
    });
    await publish(alice, 'Não listado', { visibility: 'unlisted' });
    await publish(alice, 'Rascunho', { draft: true });
    await publish(alice, 'Processando', { notReady: true });

    const feed = body<Page>(await http().get('/feed').expect(200));
    expect(feed.items.map((v) => v.id)).toEqual([newer, older]);
    expect(feed.items[0].channel?.nickname).toBe('alice');
    expect(feed.items[0].category?.slug).toBe('musica');
    expect(feed.total).toBe(2);

    const onlyGames = body<Page>(
      await http().get('/feed?category=games').expect(200),
    );
    expect(onlyGames.items.map((v) => v.id)).toEqual([older]);
    expect(
      body<Page>(await http().get('/feed?category=nada').expect(200)).total,
    ).toBe(0);
    await http().get('/feed?category=Bad Slug').expect(400);

    const paged = body<Page>(
      await http().get('/feed?page=2&limit=1').expect(200),
    );
    expect(paged.items.map((v) => v.id)).toEqual([older]);
    expect(paged).toMatchObject({ page: 2, limit: 1, total: 2 });
  });

  it('GET /search matches title and channel (case-insensitive), ignores unpublished, and validates the term', async () => {
    const alice = await loginAs('alice@example.com');
    const bob = await loginAs('bob.builder@example.com');
    const ffmpeg = await publish(alice, 'Tutorial de FFmpeg avançado');
    const bobVideo = await publish(bob, 'Construindo casas');
    await publish(alice, 'FFmpeg rascunho', { draft: true });

    const byTitle = body<Page>(
      await http().get('/search?q=ffmpeg').expect(200),
    );
    expect(byTitle.items.map((v) => v.id)).toEqual([ffmpeg]);

    const byChannel = body<Page>(await http().get('/search?q=BOB').expect(200));
    expect(byChannel.items.map((v) => v.id)).toEqual([bobVideo]);

    expect(
      body<Page>(await http().get('/search?q=100%25').expect(200)).total,
    ).toBe(0);
    await http().get('/search?q=f').expect(400);
    await http().get('/search').expect(400);
  });
});

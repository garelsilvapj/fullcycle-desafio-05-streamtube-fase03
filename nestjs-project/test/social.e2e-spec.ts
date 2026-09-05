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
  objects = new Map<string, number>();
  needsMultipart = () => false;
  createPresignedUpload = (key: string) =>
    Promise.resolve(`http://localhost:9000/put/${key}`);
  createPresignedDownload = (key: string) =>
    Promise.resolve(`http://localhost:9000/get/${key}`);
  head = (key: string) =>
    Promise.resolve(
      this.objects.has(key) ? { size: this.objects.get(key) as number } : null,
    );
  deleteObjects = () => Promise.resolve();
  abortMultipartUpload = () => Promise.resolve();
  completeMultipartUpload = () => Promise.resolve();
  createMultipartUpload = () => Promise.reject(new Error('unused'));
}

interface Summary {
  likes: number;
  dislikes: number;
  myReaction: string | null;
}
interface CommentBody {
  id: string;
  body: string | null;
  deleted: boolean;
  author: { nickname: string } | null;
  mine: boolean;
  reactions: Summary;
  replies?: CommentBody[];
}
const body = <T>(res: request.Response): T => res.body as T;

describe('Social (e2e, Fase 06)', () => {
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

  /** Vídeo publicado do dono (simula o worker). Devolve id e channelId. */
  async function publishedVideo(
    bearer: string,
  ): Promise<{ id: string; channelId: string }> {
    const created = body<{ video: { id: string } }>(
      await http()
        .post('/videos')
        .set(auth(bearer))
        .send({ title: 'v' })
        .expect(201),
    ).video;
    const row = await videos.findOneByOrFail({ id: created.id });
    await videos.update(created.id, {
      status: VideoStatus.READY,
      processed_key: 'p',
      thumbnail_key: 't',
      size_bytes: '10',
      duration_sec: 1,
    });
    await http()
      .post(`/videos/${created.id}/publish`)
      .set(auth(bearer))
      .expect(200);
    return { id: created.id, channelId: row.channel_id };
  }

  async function draftVideo(bearer: string): Promise<string> {
    return body<{ video: { id: string } }>(
      await http()
        .post('/videos')
        .set(auth(bearer))
        .send({ title: 'draft' })
        .expect(201),
    ).video.id;
  }

  describe('reações em vídeos', () => {
    it('like é único por usuário, trocar para dislike substitui, DELETE remove; anônimo lê contagens', async () => {
      const owner = await loginAs('owner@example.com');
      const alice = await loginAs('alice@example.com');
      const bob = await loginAs('bob@example.com');
      const { id } = await publishedVideo(owner);

      await http()
        .put(`/videos/${id}/reaction`)
        .set(auth(alice))
        .send({ type: 'like' })
        .expect(200);
      await http()
        .put(`/videos/${id}/reaction`)
        .set(auth(alice))
        .send({ type: 'like' })
        .expect(200);
      const afterBob = body<Summary>(
        await http()
          .put(`/videos/${id}/reaction`)
          .set(auth(bob))
          .send({ type: 'dislike' })
          .expect(200),
      );
      expect(afterBob).toEqual({
        likes: 1,
        dislikes: 1,
        myReaction: 'dislike',
      });

      const switched = body<Summary>(
        await http()
          .put(`/videos/${id}/reaction`)
          .set(auth(alice))
          .send({ type: 'dislike' })
          .expect(200),
      );
      expect(switched).toEqual({
        likes: 0,
        dislikes: 2,
        myReaction: 'dislike',
      });

      const anon = body<Summary>(
        await http().get(`/videos/${id}/reactions`).expect(200),
      );
      expect(anon).toEqual({ likes: 0, dislikes: 2, myReaction: null });

      const removed = body<Summary>(
        await http()
          .delete(`/videos/${id}/reaction`)
          .set(auth(alice))
          .expect(200),
      );
      expect(removed).toEqual({ likes: 0, dislikes: 1, myReaction: null });

      await http()
        .put(`/videos/${id}/reaction`)
        .send({ type: 'like' })
        .expect(401);
      await http()
        .put(`/videos/${id}/reaction`)
        .set(auth(alice))
        .send({ type: 'love' })
        .expect(400);
    });

    it('não permite reagir a rascunhos de terceiros (404)', async () => {
      const owner = await loginAs('owner@example.com');
      const alice = await loginAs('alice@example.com');
      const draft = await draftVideo(owner);
      await http()
        .put(`/videos/${draft}/reaction`)
        .set(auth(alice))
        .send({ type: 'like' })
        .expect(404);
    });
  });

  describe('comentários', () => {
    it('cria, responde (1 nível), lista com autores/reações, exclui logicamente só o autor', async () => {
      const owner = await loginAs('owner@example.com');
      const alice = await loginAs('alice@example.com');
      const bob = await loginAs('bob@example.com');
      const { id } = await publishedVideo(owner);

      const root = body<CommentBody>(
        await http()
          .post(`/videos/${id}/comments`)
          .set(auth(alice))
          .send({ body: 'Primeiro!' })
          .expect(201),
      );
      expect(root.author?.nickname).toBe('alice');
      const reply = body<CommentBody>(
        await http()
          .post(`/comments/${root.id}/replies`)
          .set(auth(bob))
          .send({ body: 'Resposta' })
          .expect(201),
      );
      const depth = await http()
        .post(`/comments/${reply.id}/replies`)
        .set(auth(alice))
        .send({ body: 'x' })
        .expect(400);
      expect(body<{ error: string }>(depth).error).toBe('COMMENT_REPLY_DEPTH');

      await http()
        .put(`/comments/${root.id}/reaction`)
        .set(auth(bob))
        .send({ type: 'like' })
        .expect(200);

      const list = body<{
        items: CommentBody[];
        total: number;
        commentsCount: number;
      }>(await http().get(`/videos/${id}/comments`).set(auth(bob)).expect(200));
      expect(list.total).toBe(1);
      expect(list.commentsCount).toBe(2);
      expect(list.items[0]).toMatchObject({
        id: root.id,
        body: 'Primeiro!',
        mine: false,
        reactions: { likes: 1, dislikes: 0, myReaction: 'like' },
      });
      expect(list.items[0].replies?.[0]).toMatchObject({
        id: reply.id,
        mine: true,
        author: { nickname: 'bob' },
      });

      await http().delete(`/comments/${root.id}`).set(auth(bob)).expect(403);
      await http().delete(`/comments/${root.id}`).set(auth(alice)).expect(204);
      const after = body<{ items: CommentBody[]; commentsCount: number }>(
        await http().get(`/videos/${id}/comments`).expect(200),
      );
      expect(after.items[0]).toMatchObject({
        deleted: true,
        body: null,
        author: null,
      });
      expect(after.items[0].replies).toHaveLength(1);
      expect(after.commentsCount).toBe(1);
      await http().delete(`/comments/${root.id}`).set(auth(alice)).expect(404);
      await http()
        .post(`/videos/${id}/comments`)
        .send({ body: 'anon' })
        .expect(401);
      await http()
        .post(`/videos/${id}/comments`)
        .set(auth(alice))
        .send({ body: '' })
        .expect(400);
    });
  });

  describe('inscrições', () => {
    it('inscreve (idempotente), conta, lista canais seguidos e proíbe o próprio canal', async () => {
      const owner = await loginAs('owner@example.com');
      const alice = await loginAs('alice@example.com');
      const { channelId, id } = await publishedVideo(owner);

      await http()
        .put(`/channels/${channelId}/subscription`)
        .set(auth(alice))
        .expect(200);
      const state = body<{ subscribed: boolean; subscribersCount: number }>(
        await http()
          .put(`/channels/${channelId}/subscription`)
          .set(auth(alice))
          .expect(200),
      );
      expect(state).toEqual({ subscribed: true, subscribersCount: 1 });
      expect(
        body<{ subscribed: boolean }>(
          await http().get(`/channels/${channelId}/subscription`).expect(200),
        ),
      ).toMatchObject({ subscribed: false, subscribersCount: 1 });

      const self = await http()
        .put(`/channels/${channelId}/subscription`)
        .set(auth(owner))
        .expect(409);
      expect(body<{ error: string }>(self).error).toBe('SUBSCRIPTION_SELF');

      const mine = body<
        {
          channel: { nickname: string };
          latestVideos: { id: string }[];
          subscribersCount: number;
        }[]
      >(await http().get('/me/subscriptions').set(auth(alice)).expect(200));
      expect(mine).toHaveLength(1);
      expect(mine[0].channel.nickname).toBe('owner');
      expect(mine[0].latestVideos.map((v) => v.id)).toEqual([id]);

      const off = body<{ subscribed: boolean; subscribersCount: number }>(
        await http()
          .delete(`/channels/${channelId}/subscription`)
          .set(auth(alice))
          .expect(200),
      );
      expect(off).toEqual({ subscribed: false, subscribersCount: 0 });
      await http()
        .put(`/channels/00000000-0000-4000-8000-000000000000/subscription`)
        .set(auth(alice))
        .expect(404);
    });
  });

  describe('agregados sociais', () => {
    it('GET /social/videos/:id junta reações, comentários e inscrição; GET /social/videos?ids= agrega o painel', async () => {
      const owner = await loginAs('owner@example.com');
      const alice = await loginAs('alice@example.com');
      const { id, channelId } = await publishedVideo(owner);
      await http()
        .put(`/videos/${id}/reaction`)
        .set(auth(alice))
        .send({ type: 'like' })
        .expect(200);
      await http()
        .post(`/videos/${id}/comments`)
        .set(auth(alice))
        .send({ body: 'oi' })
        .expect(201);
      await http()
        .put(`/channels/${channelId}/subscription`)
        .set(auth(alice))
        .expect(200);

      const anon = body<{
        reactions: Summary;
        commentsCount: number;
        subscription: { subscribed: boolean; subscribersCount: number };
      }>(await http().get(`/social/videos/${id}`).expect(200));
      expect(anon).toEqual({
        reactions: { likes: 1, dislikes: 0, myReaction: null },
        commentsCount: 1,
        subscription: { subscribed: false, subscribersCount: 1 },
      });
      const mine = body<{
        reactions: Summary;
        subscription: { subscribed: boolean };
      }>(await http().get(`/social/videos/${id}`).set(auth(alice)).expect(200));
      expect(mine.reactions.myReaction).toBe('like');
      expect(mine.subscription.subscribed).toBe(true);

      const stats = body<
        { videoId: string; likes: number; commentsCount: number }[]
      >(
        await http()
          .get(`/social/videos?ids=${id},00000000-0000-4000-8000-000000000000`)
          .set(auth(owner))
          .expect(200),
      );
      expect(stats).toEqual([
        { videoId: id, likes: 1, dislikes: 0, commentsCount: 1 },
        {
          videoId: '00000000-0000-4000-8000-000000000000',
          likes: 0,
          dislikes: 0,
          commentsCount: 0,
        },
      ]);
      await http().get(`/social/videos?ids=${id}`).expect(401);
    });
  });
});

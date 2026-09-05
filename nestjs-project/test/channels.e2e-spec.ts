import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';

interface ChannelBody {
  id: string;
  name: string;
  nickname: string;
  description: string | null;
  videosCount: number;
}
interface ErrorBody {
  statusCode: number;
  error: string;
}
const body = <T>(res: request.Response): T => res.body as T;

describe('Channels (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

  it('GET /categories is public and returns the seeded list', async () => {
    const res = await http().get('/categories').expect(200);
    const list = body<{ slug: string }[]>(res);
    expect(list.length).toBe(8);
    expect(list.map((c) => c.slug)).toContain('tecnologia');
  });

  it('GET /channels/me requires auth and returns my channel derived from the e-mail', async () => {
    await http().get('/channels/me').expect(401);
    const bearer = await loginAs('carol@example.com');
    const res = await http()
      .get('/channels/me')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(body<ChannelBody>(res)).toMatchObject({
      nickname: 'carol',
      name: 'carol',
      videosCount: 0,
    });
  });

  it('PATCH /channels/me edits name/nickname/description and is visible publicly', async () => {
    const bearer = await loginAs('dave@example.com');
    const res = await http()
      .patch('/channels/me')
      .set('Authorization', `Bearer ${bearer}`)
      .send({
        name: 'Dave Studios',
        nickname: 'dave_studios',
        description: 'Vídeos do Dave',
      })
      .expect(200);
    expect(body<ChannelBody>(res)).toMatchObject({
      name: 'Dave Studios',
      nickname: 'dave_studios',
      description: 'Vídeos do Dave',
    });

    const pub = await http().get('/channels/dave_studios').expect(200);
    expect(body<ChannelBody>(pub).name).toBe('Dave Studios');
    await http().get('/channels/dave').expect(404);
  });

  it.each([
    [{ nickname: 'Bad Name' }, 400],
    [{ nickname: 'ab' }, 400],
    [{ nickname: 'me' }, 400],
    [{ name: '' }, 400],
    [{ unknown: 1 }, 400],
  ])('PATCH /channels/me rejects %j with %i', async (payload, status) => {
    const bearer = await loginAs('erin@example.com');
    const res = await http()
      .patch('/channels/me')
      .set('Authorization', `Bearer ${bearer}`)
      .send(payload)
      .expect(status);
    expect(body<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
  });

  it('PATCH /channels/me returns 409 CHANNEL_NICKNAME_TAKEN on collision', async () => {
    await loginAs('frank@example.com');
    const bearer = await loginAs('grace@example.com');
    const res = await http()
      .patch('/channels/me')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ nickname: 'frank' })
      .expect(409);
    expect(body<ErrorBody>(res).error).toBe('CHANNEL_NICKNAME_TAKEN');
  });

  it('GET /channels/:nickname/videos is public and empty for a channel without published videos', async () => {
    await loginAs('heidi@example.com');
    const res = await http().get('/channels/heidi/videos').expect(200);
    expect(body<{ items: unknown[]; total: number }>(res)).toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    await http().get('/channels/nobody/videos').expect(404);
  });
});

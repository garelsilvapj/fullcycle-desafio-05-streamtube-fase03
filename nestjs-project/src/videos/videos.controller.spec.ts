import { Test } from '@nestjs/testing';

import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { StorageService } from '../storage/storage.service';
import { Video, VideoStatus } from './entities/video.entity';
import type { JwtPayload } from '../auth/auth.types';

// Cobertura HTTP completa (status, Range, autorização) fica no e2e `test/videos.e2e-spec.ts`.
// Aqui só se verifica a delegação e a serialização (nenhuma chave do storage vaza).
describe('VideosController', () => {
  let controller: VideosController;
  const video = {
    id: 'v-1',
    slug: 'aB3dE5fG7hI',
    channel_id: 'ch-1',
    title: 't',
    description: null,
    status: VideoStatus.UPLOADING,
    original_key: 'videos/ch-1/v-1/original',
    processed_key: null,
    thumbnail_key: null,
    duration_sec: null,
    size_bytes: null,
    error: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  } as Video;
  const videos = {
    register: jest.fn(() =>
      Promise.resolve({
        video,
        upload: { type: 'single', url: 'u' },
      }),
    ),
    confirmUpload: jest.fn(() => Promise.resolve(video)),
    completeMultipart: jest.fn(() => Promise.resolve(video)),
    abortMultipart: jest.fn(() => Promise.resolve(undefined)),
    delete: jest.fn(() => Promise.resolve(undefined)),
    listMine: jest.fn(() => Promise.resolve([video])),
    getOwned: jest.fn(() => Promise.resolve(video)),
  };
  const storage = {};
  const user: JwtPayload = { sub: 'user-1', email: 'u@x.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [VideosController],
      providers: [
        { provide: VideosService, useValue: videos },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    controller = mod.get(VideosController);
  });

  it('register delega com o sub do usuário e não expõe chaves do storage', async () => {
    const out = await controller.register(user, { title: 'x' });
    expect(videos.register).toHaveBeenCalledWith('user-1', { title: 'x' });
    expect(out.upload).toEqual({ type: 'single', url: 'u' });
    expect(out.video).toMatchObject({ id: 'v-1', slug: 'aB3dE5fG7hI' });
    expect(JSON.stringify(out)).not.toContain('original_key');
    expect(JSON.stringify(out)).not.toContain('videos/ch-1');
  });

  it('confirm delega para confirmUpload', async () => {
    await controller.confirm(user, 'v-1');
    expect(videos.confirmUpload).toHaveBeenCalledWith('user-1', 'v-1');
  });

  it('completeMultipart repassa uploadId e parts', async () => {
    const parts = [{ partNumber: 1, etag: 'a' }];
    await controller.completeMultipart(user, 'v-1', {
      uploadId: 'up-1',
      parts,
    });
    expect(videos.completeMultipart).toHaveBeenCalledWith(
      'user-1',
      'v-1',
      'up-1',
      parts,
    );
  });

  it('abortMultipart e remove delegam para o service', async () => {
    await controller.abortMultipart(user, 'v-1', { uploadId: 'up-1' });
    expect(videos.abortMultipart).toHaveBeenCalledWith('user-1', 'v-1', 'up-1');
    await controller.remove(user, 'v-1');
    expect(videos.delete).toHaveBeenCalledWith('user-1', 'v-1');
  });

  it('get e listMine usam o dono e serializam com error visível', async () => {
    const one = await controller.get(user, 'v-1');
    expect(videos.getOwned).toHaveBeenCalledWith('user-1', 'v-1');
    expect(one).toHaveProperty('error', null);
    const list = await controller.listMine(user);
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

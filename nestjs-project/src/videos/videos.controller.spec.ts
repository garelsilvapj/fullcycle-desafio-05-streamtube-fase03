import { Test } from '@nestjs/testing';

import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { StorageService } from '../storage/storage.service';
import type { JwtPayload } from '../auth/auth.types';

describe('VideosController', () => {
  let controller: VideosController;
  const videos = {
    register: jest.fn(async () => ({
      video: { id: 'v-1' },
      upload: { type: 'single', url: 'u' },
    })),
    confirmUpload: jest.fn(async () => ({ id: 'v-1' })),
    completeMultipart: jest.fn(async () => ({ id: 'v-1' })),
    abortMultipart: jest.fn(async () => undefined),
    listMine: jest.fn(async () => []),
    get: jest.fn(async () => ({ id: 'v-1' })),
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

  it('register delega para o service com o sub do usuário', async () => {
    await controller.register(user, { title: 'x' });
    expect(videos.register).toHaveBeenCalledWith('user-1', { title: 'x' });
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

  it('abortMultipart chama o service e responde aborted', async () => {
    const res = await controller.abortMultipart(user, 'v-1', 'up-1');
    expect(videos.abortMultipart).toHaveBeenCalledWith('user-1', 'v-1', 'up-1');
    expect(res).toEqual({ aborted: true });
  });
});

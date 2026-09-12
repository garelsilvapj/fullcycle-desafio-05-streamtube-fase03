import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { ReactionsService } from '../reactions/reactions.service';
import { VideosService } from '../videos/videos.service';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';
import {
  CommentForbiddenException,
  CommentNotFoundException,
  CommentReplyDepthException,
} from './comment.exceptions';

describe('CommentsService', () => {
  let service: CommentsService;
  const repo = {
    findOne: jest.fn(),
    save: jest.fn((c: Partial<Comment>) =>
      Promise.resolve({ ...c, id: 'c-new', created_at: new Date() }),
    ),
    create: jest.fn((c: Partial<Comment>) => c),
  };
  const channels = {
    find: jest.fn(() =>
      Promise.resolve([
        { id: 'ch', user_id: 'u1', nickname: 'u1', name: 'U1' },
      ]),
    ),
  };
  const videos = {
    getViewable: jest.fn(() =>
      Promise.resolve({ id: 'v-1', channel_id: 'ch' }),
    ),
  };
  const reactions = { commentSummaries: jest.fn(() => Promise.resolve([])) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: repo },
        { provide: getRepositoryToken(Channel), useValue: channels },
        { provide: VideosService, useValue: videos },
        { provide: ReactionsService, useValue: reactions },
      ],
    }).compile();
    service = mod.get(CommentsService);
  });

  it('reply rejeita responder a uma resposta (profundidade máxima 2)', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'r',
      parent_id: 'root',
      video_id: 'v-1',
      deleted_at: null,
    });
    await expect(service.reply('u1', 'r', 'x')).rejects.toBeInstanceOf(
      CommentReplyDepthException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reply a um comentário raiz cria a resposta com o autor', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'root',
      parent_id: null,
      video_id: 'v-1',
      deleted_at: null,
    });
    const out = await service.reply('u1', 'root', 'Resposta');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: 'root', body: 'Resposta' }),
    );
    expect(out.author).toEqual({ id: 'ch', nickname: 'u1', name: 'U1' });
    expect(out.mine).toBe(true);
  });

  it('remove exige o autor e faz exclusão lógica; comentário excluído vira 404', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'c',
      user_id: 'u2',
      deleted_at: null,
    });
    await expect(service.remove('u1', 'c')).rejects.toBeInstanceOf(
      CommentForbiddenException,
    );

    const own = { id: 'c', user_id: 'u1', deleted_at: null as Date | null };
    repo.findOne.mockResolvedValueOnce(own);
    await service.remove('u1', 'c');
    expect(own.deleted_at).toBeInstanceOf(Date);

    repo.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('u1', 'c')).rejects.toBeInstanceOf(
      CommentNotFoundException,
    );
  });
});

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { ChannelNotFoundException } from '../channels/channel.exceptions';
import { VideosService } from '../videos/videos.service';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionSelfException } from './subscription.exceptions';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  const execute = jest.fn(() => Promise.resolve());
  const qb = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute,
  };
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    count: jest.fn(() => Promise.resolve(0)),
    delete: jest.fn(() => Promise.resolve()),
    find: jest.fn(() => Promise.resolve([])),
  };
  const channels = {
    findOne: jest.fn(),
    find: jest.fn(() => Promise.resolve([])),
  };
  const videos = { listPublicByChannel: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: getRepositoryToken(Subscription), useValue: repo },
        { provide: getRepositoryToken(Channel), useValue: channels },
        { provide: VideosService, useValue: videos },
      ],
    }).compile();
    service = mod.get(SubscriptionsService);
  });

  it('não permite inscrever-se no próprio canal', async () => {
    channels.findOne.mockResolvedValue({ id: 'ch', user_id: 'u1' });
    await expect(service.subscribe('u1', 'ch')).rejects.toBeInstanceOf(
      SubscriptionSelfException,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('subscribe é idempotente (INSERT ... ON CONFLICT DO NOTHING) e devolve o estado', async () => {
    channels.findOne.mockResolvedValue({ id: 'ch', user_id: 'owner' });
    repo.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    const state = await service.subscribe('u1', 'ch');
    expect(qb.orIgnore).toHaveBeenCalled();
    expect(state).toEqual({ subscribed: true, subscribersCount: 3 });
  });

  it('canal inexistente → CHANNEL_NOT_FOUND', async () => {
    channels.findOne.mockResolvedValue(null);
    await expect(service.state(null, 'nope')).rejects.toBeInstanceOf(
      ChannelNotFoundException,
    );
  });
});

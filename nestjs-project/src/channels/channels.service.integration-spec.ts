import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { ChannelsService } from './channels.service';
import { Channel } from './entities/channel.entity';
import {
  ChannelNotFoundException,
  NicknameTakenException,
} from './channel.exceptions';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken];

describe('ChannelsService (integration)', () => {
  let dataSource: DataSource;
  let channelsService: ChannelsService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    channelsService = new ChannelsService(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let userCounter = 0;
  async function createUser(): Promise<User> {
    return userRepository.save(
      userRepository.create({
        email: `ch_svc_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
  }

  describe('createChannel', () => {
    it('persists a channel derived from email', async () => {
      const user = await createUser();

      const channel = await channelsService.createChannel(
        user.id,
        'mynick@example.com',
      );

      expect(channel.id).toBeDefined();
      expect(channel.nickname).toBe('mynick');
      expect(channel.name).toBe('mynick');
      expect(channel.user_id).toBe(user.id);

      const persisted = await channelRepository.findOneBy({ user_id: user.id });
      expect(persisted).not.toBeNull();
      expect(persisted!.nickname).toBe('mynick');
    });

    it('derives nickname from email prefix', async () => {
      const user = await createUser();

      const channel = await channelsService.createChannel(
        user.id,
        'John.Doe+tag@example.com',
      );

      expect(channel.nickname).toBe('johndoetag');
    });

    it('resolves nickname collision by appending a suffix', async () => {
      const user1 = await createUser();
      const user2 = await createUser();

      await channelsService.createChannel(user1.id, 'shared@example.com');
      const channel2 = await channelsService.createChannel(
        user2.id,
        'shared@example.com',
      );

      expect(channel2.nickname).toMatch(/^shared_[a-z0-9]{3}$/);

      const channels = await channelRepository.find();
      expect(channels).toHaveLength(2);
    });
  });

  describe('getMine / updateMine / getByNickname (Fase 04)', () => {
    it('updates name, nickname and description of the own channel', async () => {
      const user = await createUser();
      await channelsService.createChannel(user.id, user.email);

      const updated = await channelsService.updateMine(user.id, {
        name: 'Canal da Alice',
        nickname: 'alice_videos',
        description: 'Sobre o canal',
      });
      expect(updated).toMatchObject({
        name: 'Canal da Alice',
        nickname: 'alice_videos',
        description: 'Sobre o canal',
      });
      expect((await channelsService.getMine(user.id)).nickname).toBe(
        'alice_videos',
      );
      expect((await channelsService.getByNickname('alice_videos')).id).toBe(
        updated.id,
      );
    });

    it('rejects a nickname already used by another channel', async () => {
      const a = await createUser();
      const b = await createUser();
      await channelsService.createChannel(a.id, 'taken@example.com');
      await channelsService.createChannel(b.id, b.email);
      await expect(
        channelsService.updateMine(b.id, { nickname: 'taken' }),
      ).rejects.toBeInstanceOf(NicknameTakenException);
    });

    it('throws CHANNEL_NOT_FOUND for users without channel and unknown nicknames', async () => {
      const user = await createUser();
      await expect(channelsService.getMine(user.id)).rejects.toBeInstanceOf(
        ChannelNotFoundException,
      );
      await expect(
        channelsService.getByNickname('ghost_channel'),
      ).rejects.toBeInstanceOf(ChannelNotFoundException);
    });

    it('countPublishedVideos counts only public, published, ready videos', async () => {
      const user = await createUser();
      const channel = await channelsService.createChannel(user.id, user.email);
      const insert = (slug: string, extra: string) =>
        dataSource.query(
          `INSERT INTO "videos" ("channel_id","slug","title","original_key","status","visibility","published_at")
           VALUES ($1,$2,'t','k',${extra})`,
          [channel.id, slug],
        );
      await insert('slug0000001', `'ready','public',now()`);
      await insert('slug0000002', `'ready','unlisted',now()`);
      await insert('slug0000003', `'ready','public',NULL`);
      await insert('slug0000004', `'processing','public',now()`);
      expect(await channelsService.countPublishedVideos(channel.id)).toBe(1);
    });
  });
});

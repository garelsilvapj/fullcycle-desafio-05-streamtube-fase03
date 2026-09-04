import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { Video, VideoStatus } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let users: Repository<User>;
  let channels: Repository<Channel>;
  let videos: Repository<Video>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES, { synchronize: false });
    await dataSource.initialize();
    users = dataSource.getRepository(User);
    channels = dataSource.getRepository(Channel);
    videos = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function createChannel(): Promise<Channel> {
    const n = ++counter;
    const user = await users.save(
      users.create({ email: `video_user_${n}@example.com`, password: 'x' }),
    );
    return channels.save(
      channels.create({
        name: `c${n}`,
        nickname: `vchan${n}`,
        user_id: user.id,
      }),
    );
  }

  function draft(channel: Channel, overrides: Partial<Video> = {}): Video {
    return videos.create({
      channel_id: channel.id,
      slug: `slug${String(++counter).padStart(7, '0')}`,
      title: 'Título',
      original_key: `videos/${channel.id}/x/original`,
      ...overrides,
    });
  }

  it('applies defaults: status uploading, null artifacts, timestamps', async () => {
    const channel = await createChannel();
    const saved = await videos.save(draft(channel));
    const found = await videos.findOneByOrFail({ id: saved.id });

    expect(found.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(found.status).toBe(VideoStatus.UPLOADING);
    expect(found.description).toBeNull();
    expect(found.processed_key).toBeNull();
    expect(found.thumbnail_key).toBeNull();
    expect(found.duration_sec).toBeNull();
    expect(found.size_bytes).toBeNull();
    expect(found.error).toBeNull();
    expect(found.created_at).toBeInstanceOf(Date);
    expect(found.updated_at).toBeInstanceOf(Date);
  });

  it('enforces the unique slug index', async () => {
    const channel = await createChannel();
    await videos.save(draft(channel, { slug: 'dupslug0001' }));
    await expect(
      videos.save(draft(channel, { slug: 'dupslug0001' })),
    ).rejects.toThrow(/duplicate key|UQ_videos_slug/);
  });

  it('rejects slug longer than 11 chars and title longer than 200 chars', async () => {
    const channel = await createChannel();
    await expect(
      videos.save(draft(channel, { slug: 'a'.repeat(12) })),
    ).rejects.toThrow();
    await expect(
      videos.save(draft(channel, { title: 't'.repeat(201) })),
    ).rejects.toThrow();
  });

  it('persists every status of the state machine', async () => {
    const channel = await createChannel();
    for (const status of Object.values(VideoStatus)) {
      const saved = await videos.save(draft(channel, { status }));
      expect((await videos.findOneByOrFail({ id: saved.id })).status).toBe(
        status,
      );
    }
  });

  it('stores size_bytes as bigint (string in TypeORM) beyond 2^31', async () => {
    const channel = await createChannel();
    const big = String(6 * 1024 * 1024 * 1024); // 6 GiB
    const saved = await videos.save(draft(channel, { size_bytes: big }));
    const found = await videos.findOneByOrFail({ id: saved.id });
    expect(found.size_bytes).toBe(big);
  });

  it('cascades: deleting the channel deletes its videos', async () => {
    const channel = await createChannel();
    await videos.save(draft(channel));
    await videos.save(draft(channel));
    expect(await videos.countBy({ channel_id: channel.id })).toBe(2);

    await channels.delete(channel.id);
    expect(await videos.countBy({ channel_id: channel.id })).toBe(0);
  });

  it('rejects a video whose channel does not exist (FK)', async () => {
    const channel = await createChannel();
    await expect(
      videos.save(
        draft(channel, { channel_id: '00000000-0000-0000-0000-000000000000' }),
      ),
    ).rejects.toThrow();
  });

  it('loads the channel relation', async () => {
    const channel = await createChannel();
    const saved = await videos.save(draft(channel));
    const found = await videos.findOne({
      where: { id: saved.id },
      relations: ['channel'],
    });
    expect(found?.channel?.nickname).toBe(channel.nickname);
  });
});

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { ChannelNotFoundException } from '../channels/channel.exceptions';
import { toChannelResponse } from '../channels/dto/channel-response.dto';
import { VideosService } from '../videos/videos.service';
import { toVideoResponse } from '../videos/dto/video-response.dto';
import { Subscription } from './entities/subscription.entity';
import {
  FollowedChannelDto,
  SubscriptionStateDto,
} from './dto/subscription.dto';
import { SubscriptionSelfException } from './subscription.exceptions';

export const FOLLOWED_LATEST_VIDEOS = 4;

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly repo: Repository<Subscription>,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly videos: VideosService,
  ) {}

  private async channelById(id: string): Promise<Channel> {
    const channel = await this.channels.findOne({ where: { id } });
    if (!channel) throw new ChannelNotFoundException();
    return channel;
  }

  /** Idempotente; não permite inscrever-se no próprio canal (TD-06.3). */
  async subscribe(
    userId: string,
    channelId: string,
  ): Promise<SubscriptionStateDto> {
    const channel = await this.channelById(channelId);
    if (channel.user_id === userId) throw new SubscriptionSelfException();
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({ channel_id: channel.id, subscriber_id: userId })
      .orIgnore()
      .execute();
    return this.state(userId, channel.id);
  }

  async unsubscribe(
    userId: string,
    channelId: string,
  ): Promise<SubscriptionStateDto> {
    const channel = await this.channelById(channelId);
    await this.repo.delete({ channel_id: channel.id, subscriber_id: userId });
    return this.state(userId, channel.id);
  }

  async state(
    userId: string | null,
    channelId: string,
  ): Promise<SubscriptionStateDto> {
    await this.channelById(channelId);
    const [subscribersCount, mine] = await Promise.all([
      this.repo.count({ where: { channel_id: channelId } }),
      userId
        ? this.repo.count({
            where: { channel_id: channelId, subscriber_id: userId },
          })
        : Promise.resolve(0),
    ]);
    return { subscribed: mine > 0, subscribersCount };
  }

  async countsForChannels(channelIds: string[]): Promise<Map<string, number>> {
    if (channelIds.length === 0) return new Map();
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('s.channel_id', 'channel_id')
      .addSelect('COUNT(*)::text', 'count')
      .where('s.channel_id IN (:...ids)', { ids: channelIds })
      .groupBy('s.channel_id')
      .getRawMany<{ channel_id: string; count: string }>();
    return new Map(rows.map((r) => [r.channel_id, Number(r.count)]));
  }

  /** Canais seguidos com os últimos vídeos públicos publicados (área "inscrições"). */
  async listMine(userId: string): Promise<FollowedChannelDto[]> {
    const subs = await this.repo.find({
      where: { subscriber_id: userId },
      order: { created_at: 'DESC' },
    });
    if (subs.length === 0) return [];
    const channels = await this.channels.find({
      where: { id: In(subs.map((s) => s.channel_id)) },
    });
    const byId = new Map(channels.map((c) => [c.id, c]));
    const counts = await this.countsForChannels(channels.map((c) => c.id));
    const out: FollowedChannelDto[] = [];
    for (const sub of subs) {
      const channel = byId.get(sub.channel_id);
      if (!channel) continue;
      const latest = await this.videos.listPublicByChannel(channel.nickname, {
        page: 1,
        limit: FOLLOWED_LATEST_VIDEOS,
      });
      out.push({
        channel: toChannelResponse(channel, latest.total),
        subscribersCount: counts.get(channel.id) ?? 0,
        latestVideos: latest.items.map((v) =>
          toVideoResponse(v, { owner: false }),
        ),
        subscribedAt: sub.created_at.toISOString(),
      });
    }
    return out;
  }
}

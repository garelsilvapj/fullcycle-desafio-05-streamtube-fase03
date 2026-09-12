import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isPgUniqueViolationOnColumn } from '../common/database/pg-errors';
import { appendRandomSuffix, sanitizeNickname } from './nickname.util';
import { Channel } from './entities/channel.entity';
import { UpdateChannelDto } from './dto/update-channel.dto';
import {
  ChannelNotFoundException,
  NicknameTakenException,
} from './channel.exceptions';

const NICKNAME_COLUMN = 'nickname';
const MAX_RETRIES = 5;

@Injectable()
export class ChannelsService {
  constructor(private readonly dataSource: DataSource) {}

  async createChannel(userId: string, email: string): Promise<Channel> {
    const baseNickname = sanitizeNickname(email.split('@')[0]);

    return this.dataSource.transaction(async (manager) => {
      let nickname = baseNickname;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const existing = await manager.findOne(Channel, {
          where: { nickname },
        });
        if (existing) {
          nickname = appendRandomSuffix(baseNickname);
          continue;
        }

        try {
          return await manager.save(
            manager.create(Channel, {
              name: baseNickname,
              nickname,
              user_id: userId,
            }),
          );
        } catch (err) {
          if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
            // Concurrent insert between pre-check and save — retry with new suffix
            nickname = appendRandomSuffix(baseNickname);
          } else {
            throw err;
          }
        }
      }

      throw new Error(
        'Nickname conflict could not be resolved after max retries',
      );
    });
  }

  /** Canal do usuário autenticado (1:1). */
  async getMine(userId: string): Promise<Channel> {
    const channel = await this.dataSource
      .getRepository(Channel)
      .findOne({ where: { user_id: userId } });
    if (!channel) throw new ChannelNotFoundException();
    return channel;
  }

  /** Edita nome, nickname e descrição do próprio canal; nickname único (TD-04.7). */
  async updateMine(userId: string, dto: UpdateChannelDto): Promise<Channel> {
    const channel = await this.getMine(userId);
    if (dto.name !== undefined) channel.name = dto.name;
    if (dto.nickname !== undefined) channel.nickname = dto.nickname;
    if (dto.description !== undefined) channel.description = dto.description;
    try {
      return await this.dataSource.getRepository(Channel).save(channel);
    } catch (err) {
      if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
        throw new NicknameTakenException();
      }
      throw err;
    }
  }

  /** Canal público por nickname. */
  async getByNickname(nickname: string): Promise<Channel> {
    const channel = await this.dataSource
      .getRepository(Channel)
      .findOne({ where: { nickname } });
    if (!channel) throw new ChannelNotFoundException();
    return channel;
  }

  /** Quantidade de vídeos públicos publicados (o que a página pública lista). */
  async countPublishedVideos(channelId: string): Promise<number> {
    const rows = await this.dataSource.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM "videos"
       WHERE "channel_id" = $1 AND "visibility" = 'public'
         AND "published_at" IS NOT NULL AND "status" = 'ready'`,
      [channelId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}

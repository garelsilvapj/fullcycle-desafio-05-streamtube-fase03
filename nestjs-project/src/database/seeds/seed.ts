import * as argon2 from 'argon2';
import { AppDataSource } from '../data-source';
import { User } from '../../users/entities/user.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { sanitizeNickname } from '../../channels/nickname.util';

/**
 * Seed de desenvolvimento: um usuário já confirmado (com canal) para exercitar a API
 * sem passar pelo fluxo de e-mail. Idempotente: não recria se o e-mail já existir.
 * Nunca rode em produção.
 */
export const DEV_USER = {
  email: process.env.SEED_USER_EMAIL ?? 'dev@streamtube.local',
  password: process.env.SEED_USER_PASSWORD ?? 'Dev@123456',
} as const;

export async function seedDevUser(): Promise<void> {
  const users = AppDataSource.getRepository(User);

  const existing = await users.findOne({ where: { email: DEV_USER.email } });
  if (existing) {
    console.log(
      `Seed: usuário ${DEV_USER.email} já existe (id ${existing.id})`,
    );
    return;
  }

  await AppDataSource.transaction(async (manager) => {
    const user = await manager.save(
      manager.create(User, {
        email: DEV_USER.email,
        password: await argon2.hash(DEV_USER.password),
        is_confirmed: true,
      }),
    );
    const nickname = sanitizeNickname(DEV_USER.email.split('@')[0]);
    await manager.save(
      manager.create(Channel, { name: nickname, nickname, user_id: user.id }),
    );
    console.log(
      `Seed: usuário ${DEV_USER.email} criado com canal @${nickname}`,
    );
  });
}

async function runSeed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed de desenvolvimento não pode rodar em produção');
  }
  await AppDataSource.initialize();
  console.log('Database connection initialized');

  await seedDevUser();

  await AppDataSource.destroy();
  console.log('Database connection closed');
}

if (require.main === module) {
  runSeed().catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
}

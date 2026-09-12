import type { Category, PublicChannel } from "@/lib/api/contracts";

export const CHANNEL_FIXTURE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const baseChannel: PublicChannel = {
  id: CHANNEL_FIXTURE_ID,
  name: "Alice",
  nickname: "alice",
  description: "Canal da Alice",
  videosCount: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
};

export const buildChannel = (overrides: Partial<PublicChannel> = {}): PublicChannel => ({
  ...baseChannel,
  ...overrides,
});

export const buildCategories = (): Category[] => [
  { id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", name: "Games", slug: "games" },
  { id: "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2", name: "Música", slug: "musica" },
  { id: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3", name: "Tecnologia", slug: "tecnologia" },
];

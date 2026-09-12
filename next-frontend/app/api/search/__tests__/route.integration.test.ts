import { beforeAll, describe, expect, it } from "vitest";

let search: (req: Request) => Promise<Response>;
let feed: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ GET: search } = await import("@/app/api/search/route"));
  ({ GET: feed } = await import("@/app/api/videos/feed/route"));
});

describe("discovery routes (Fase 07)", () => {
  it("feed is public, paginated and forwards the category filter", async () => {
    const first = await feed(new Request("http://localhost/api/videos/feed?page=1&limit=4"));
    expect(first.status).toBe(200);
    const page = (await first.json()) as { items: unknown[]; total: number; page: number; limit: number };
    expect(page.items).toHaveLength(4);
    expect(page.total).toBeGreaterThan(4);

    const empty = await feed(new Request("http://localhost/api/videos/feed?category=vazia"));
    expect(((await empty.json()) as { total: number }).total).toBe(0);
  });

  it("search returns matches and passes the short-term validation error through", async () => {
    const ok = await search(new Request("http://localhost/api/search?q=exemplo"));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { total: number }).total).toBe(1);

    const bad = await search(new Request("http://localhost/api/search?q=x"));
    expect(bad.status).toBe(400);
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MISSING_NICKNAME, TAKEN_NICKNAME } from "@/mocks/handlers/channels";
import { cookieMap, loginFixture } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type NickHandler = (req: Request, ctx: { params: Promise<{ nickname: string }> }) => Promise<Response>;
let getMe: () => Promise<Response>;
let patchMe: (req: Request) => Promise<Response>;
let getPublic: NickHandler;
let getPublicVideos: NickHandler;

beforeAll(async () => {
  ({ GET: getMe, PATCH: patchMe } = await import("@/app/api/channels/me/route"));
  ({ GET: getPublic } = await import("@/app/api/channels/[nickname]/route"));
  ({ GET: getPublicVideos } = await import("@/app/api/channels/[nickname]/videos/route"));
});

beforeEach(() => cookieMap.clear());

const nick = (nickname: string) => ({ params: Promise.resolve({ nickname }) });
const patch = (body: unknown) =>
  new Request("http://localhost/api/channels/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("channels routes", () => {
  it("GET/PATCH /api/channels/me require a session", async () => {
    expect((await getMe()).status).toBe(401);
    expect((await patchMe(patch({ name: "x" }))).status).toBe(401);
  });

  it("GET /api/channels/me returns my channel; PATCH updates it and maps 409/400", async () => {
    await loginFixture();
    expect(await (await getMe()).json()).toMatchObject({ nickname: "alice" });

    const ok = await patchMe(patch({ name: "Alice Studios", nickname: "alice_studios", description: null }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ name: "Alice Studios", nickname: "alice_studios", description: null });

    const taken = await patchMe(patch({ nickname: TAKEN_NICKNAME }));
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ error: "CHANNEL_NICKNAME_TAKEN" });

    expect((await patchMe(patch({ nickname: "Bad Name" }))).status).toBe(400);
  });

  it("public channel routes work without a session and pass 404 through", async () => {
    const channel = await getPublic(new Request("http://localhost/api/channels/alice"), nick("alice"));
    expect(channel.status).toBe(200);
    expect(await channel.json()).toMatchObject({ nickname: "alice", videosCount: 1 });

    const videos = await getPublicVideos(
      new Request("http://localhost/api/channels/alice/videos?page=1&limit=10"),
      nick("alice"),
    );
    expect(videos.status).toBe(200);
    const page = (await videos.json()) as { items: { isPublished: boolean }[]; total: number; limit: number };
    expect(page.limit).toBe(10);
    expect(page.total).toBe(1);
    expect(page.items.every((v) => v.isPublished)).toBe(true);

    expect((await getPublic(new Request("http://localhost/api/channels/ghost"), nick(MISSING_NICKNAME))).status).toBe(404);
  });
});

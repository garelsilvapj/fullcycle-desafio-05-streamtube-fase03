import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DRAFT_SLUG, MISSING_VIDEO_ID, RELATED_VIDEO_ID, UNLISTED_SLUG } from "@/mocks/handlers/videos";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type SlugHandler = (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;
type IdHandler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let bySlug: SlugHandler;
let related: IdHandler;
let views: IdHandler;
let stream: IdHandler;
let download: IdHandler;

beforeAll(async () => {
  ({ GET: bySlug } = await import("@/app/api/videos/slug/[slug]/route"));
  ({ GET: related } = await import("@/app/api/videos/[id]/related/route"));
  ({ POST: views } = await import("@/app/api/videos/[id]/views/route"));
  ({ GET: stream } = await import("@/app/api/videos/[id]/stream/route"));
  ({ GET: download } = await import("@/app/api/videos/[id]/download/route"));
});

beforeEach(() => cookieMap.clear());

const slugParams = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (url: string, method = "GET") => new Request(`http://localhost${url}`, { method });

describe("watch routes (Fase 05)", () => {
  it("GET /api/videos/slug/:slug is public, includes the channel and passes 404 through", async () => {
    const res = await bySlug(req("/api/videos/slug/aB3dE5fG7hI"), slugParams("aB3dE5fG7hI"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { channel?: { nickname: string }; error?: unknown };
    expect(body.channel?.nickname).toBe("alice");
    expect(body).not.toHaveProperty("error");

    expect((await bySlug(req("/x"), slugParams(UNLISTED_SLUG))).status).toBe(200);
    expect((await bySlug(req("/x"), slugParams(DRAFT_SLUG))).status).toBe(404);
  });

  it("stream and download work without a session (public) and keep 404 for missing videos", async () => {
    const partial = await stream(
      new Request("http://localhost/api/videos/x/stream", { headers: { Range: "bytes=0-9" } }),
      params(VIDEO_FIXTURE_ID),
    );
    expect(partial.status).toBe(206);
    expect((await download(req("/x"), params(VIDEO_FIXTURE_ID))).status).toBe(302);
    expect((await stream(req("/x"), params(MISSING_VIDEO_ID))).status).toBe(404);

    await loginFixture();
    expect((await stream(req("/x"), params(VIDEO_FIXTURE_ID))).status).toBe(200);
  });

  it("related returns public suggestions and views registers 204", async () => {
    const res = await related(req("/api/videos/x/related?limit=4"), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string }[];
    expect(list.map((v) => v.id)).toEqual([RELATED_VIDEO_ID]);

    expect((await views(req("/x", "POST"), params(VIDEO_FIXTURE_ID))).status).toBe(204);
    expect((await views(req("/x", "POST"), params(MISSING_VIDEO_ID))).status).toBe(404);
  });
});

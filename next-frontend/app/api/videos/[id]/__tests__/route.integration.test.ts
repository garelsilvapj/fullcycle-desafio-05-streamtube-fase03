import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FORBIDDEN_VIDEO_ID, MISSING_VIDEO_ID } from "@/mocks/handlers/videos";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let GET: Handler;
let DELETE: Handler;

beforeAll(async () => {
  ({ GET, DELETE } = await import("@/app/api/videos/[id]/route"));
});

beforeEach(() => cookieMap.clear());

const req = (method: string) => new Request("http://localhost/api/videos/x", { method });

describe("GET /api/videos/:id", () => {
  it("returns 401 without a session", async () => {
    expect((await GET(req("GET"), params(VIDEO_FIXTURE_ID))).status).toBe(401);
  });

  it("passes the video through", async () => {
    await loginFixture();
    const res = await GET(req("GET"), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: VIDEO_FIXTURE_ID, status: "ready" });
  });

  it.each([
    [MISSING_VIDEO_ID, 404, "VIDEO_NOT_FOUND"],
    [FORBIDDEN_VIDEO_ID, 403, "VIDEO_CHANNEL_FORBIDDEN"],
  ])("passes upstream errors through (%s → %i)", async (id, status, code) => {
    await loginFixture();
    const res = await GET(req("GET"), params(id));
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error: code });
  });
});

describe("DELETE /api/videos/:id", () => {
  it("returns 204 on success and passes 404 through", async () => {
    await loginFixture();
    expect((await DELETE(req("DELETE"), params(VIDEO_FIXTURE_ID))).status).toBe(204);
    expect((await DELETE(req("DELETE"), params(MISSING_VIDEO_ID))).status).toBe(404);
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MISSING_VIDEO_ID, PROCESSING_VIDEO_ID } from "@/mocks/handlers/videos";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let GET: Handler;
let POST: Handler;
let DELETE: Handler;
let confirm: Handler;

beforeAll(async () => {
  ({ GET, POST, DELETE } = await import("@/app/api/videos/[id]/thumbnail/route"));
  ({ POST: confirm } = await import("@/app/api/videos/[id]/thumbnail/confirm/route"));
});

beforeEach(() => cookieMap.clear());

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/videos/x/thumbnail", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

describe("thumbnail routes", () => {
  it("GET is public: redirects without a session (published video) and passes 404 through", async () => {
    const res = await GET(req("GET"), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("thumb.jpg");
    expect((await GET(req("GET"), params(MISSING_VIDEO_ID))).status).toBe(404);
  });

  it("GET sends the session bearer when logged in", async () => {
    await loginFixture();
    expect((await GET(req("GET"), params(PROCESSING_VIDEO_ID))).status).toBe(302);
  });

  it("POST returns the presigned plan and validates the content type; confirm and DELETE update the video", async () => {
    await loginFixture();
    const plan = await POST(req("POST", { contentType: "image/png" }), params(VIDEO_FIXTURE_ID));
    expect(plan.status).toBe(200);
    expect(((await plan.json()) as { url: string }).url).toContain("thumb-custom");

    const bad = await POST(req("POST", { contentType: "image/gif" }), params(VIDEO_FIXTURE_ID));
    expect(bad.status).toBe(400);

    const confirmed = await confirm(req("POST"), params(VIDEO_FIXTURE_ID));
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ hasCustomThumbnail: true });

    const removed = await DELETE(req("DELETE"), params(VIDEO_FIXTURE_ID));
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({ hasCustomThumbnail: false });
  });

  it("POST/DELETE/confirm return 401 without a session", async () => {
    expect((await POST(req("POST", { contentType: "image/png" }), params(VIDEO_FIXTURE_ID))).status).toBe(401);
    expect((await DELETE(req("DELETE"), params(VIDEO_FIXTURE_ID))).status).toBe(401);
    expect((await confirm(req("POST"), params(VIDEO_FIXTURE_ID))).status).toBe(401);
  });
});

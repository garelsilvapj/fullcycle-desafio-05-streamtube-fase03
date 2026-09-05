import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_VIDEO_ID } from "@/mocks/handlers/videos";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let publish: Handler;
let unpublish: Handler;
let patch: Handler;

beforeAll(async () => {
  ({ POST: publish } = await import("@/app/api/videos/[id]/publish/route"));
  ({ POST: unpublish } = await import("@/app/api/videos/[id]/unpublish/route"));
  ({ PATCH: patch } = await import("@/app/api/videos/[id]/route"));
});

beforeEach(() => cookieMap.clear());

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/videos/x", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

describe("publish / unpublish / PATCH", () => {
  it("publish returns the published video and 409 for unprocessed videos", async () => {
    await loginFixture();
    const ok = await publish(req("POST"), params(VIDEO_FIXTURE_ID));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ isPublished: true });

    const early = await publish(req("POST"), params(PROCESSING_VIDEO_ID));
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ error: "VIDEO_NOT_PUBLISHABLE" });
  });

  it("unpublish returns a draft", async () => {
    await loginFixture();
    const res = await unpublish(req("POST"), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ isPublished: false, publishedAt: null });
  });

  it("PATCH forwards the edit and passes validation errors through", async () => {
    await loginFixture();
    const res = await patch(
      req("PATCH", { title: "Novo", visibility: "unlisted", categoryId: null }),
      params(VIDEO_FIXTURE_ID),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: "Novo", visibility: "unlisted", category: null });

    const bad = await patch(req("PATCH", { title: "" }), params(VIDEO_FIXTURE_ID));
    expect(bad.status).toBe(400);
    expect((await publish(req("POST"), params(VIDEO_FIXTURE_ID))).status).toBe(200);
  });

  it("returns 401 without a session", async () => {
    expect((await publish(req("POST"), params(VIDEO_FIXTURE_ID))).status).toBe(401);
    expect((await patch(req("PATCH", { title: "x" }), params(VIDEO_FIXTURE_ID))).status).toBe(401);
  });
});

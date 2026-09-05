import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let complete: Handler;
let abort: Handler;

beforeAll(async () => {
  ({ POST: complete } = await import("@/app/api/videos/[id]/multipart/complete/route"));
  ({ POST: abort } = await import("@/app/api/videos/[id]/multipart/abort/route"));
});

beforeEach(() => cookieMap.clear());

const json = (body: unknown) =>
  new Request("http://localhost/api/videos/x/multipart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/videos/:id/multipart/complete", () => {
  it("returns the uploaded video after completing", async () => {
    await loginFixture();
    const res = await complete(
      json({ uploadId: "up", parts: [{ partNumber: 1, etag: '"a"' }] }),
      params(VIDEO_FIXTURE_ID),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "uploaded" });
  });

  it("passes validation errors through", async () => {
    await loginFixture();
    const res = await complete(json({ uploadId: "up", parts: [] }), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/videos/:id/multipart/abort", () => {
  it("returns 204", async () => {
    await loginFixture();
    const res = await abort(json({ uploadId: "up" }), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(204);
  });
});

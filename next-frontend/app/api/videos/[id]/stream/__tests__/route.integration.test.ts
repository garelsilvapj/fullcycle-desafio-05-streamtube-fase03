import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MISSING_VIDEO_ID } from "@/mocks/handlers/videos";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let GET: Handler;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/videos/[id]/stream/route"));
});

beforeEach(() => cookieMap.clear());

const req = (range?: string) =>
  new Request("http://localhost/api/videos/x/stream", {
    headers: range ? { Range: range } : undefined,
  });

describe("GET /api/videos/:id/stream", () => {
  it("is public (Fase 05): serves a published video without a session", async () => {
    expect((await GET(req(), params(VIDEO_FIXTURE_ID))).status).toBe(200);
  });

  it("streams the whole file with content headers when there is no Range", async () => {
    await loginFixture();
    const res = await GET(req(), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("4096");
    expect((await res.arrayBuffer()).byteLength).toBe(4096);
  });

  it("forwards the Range header and returns 206 with Content-Range and the exact bytes", async () => {
    await loginFixture();
    const res = await GET(req("bytes=100-355"), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 100-355/4096");
    expect(res.headers.get("content-length")).toBe("256");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBe(256);
    expect(bytes[0]).toBe(100);
  });

  it("passes 416 and 404 through as JSON envelopes", async () => {
    await loginFixture();
    const bad = await GET(req("items=0-1"), params(VIDEO_FIXTURE_ID));
    expect(bad.status).toBe(416);
    expect(await bad.json()).toMatchObject({ error: "VIDEO_INVALID_RANGE" });
    expect((await GET(req(), params(MISSING_VIDEO_ID))).status).toBe(404);
  });
});

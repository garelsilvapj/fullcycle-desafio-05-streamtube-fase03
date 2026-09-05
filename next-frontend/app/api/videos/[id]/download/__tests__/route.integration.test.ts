import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MISSING_VIDEO_ID } from "@/mocks/handlers/videos";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let download: Handler;
let thumbnail: Handler;

beforeAll(async () => {
  ({ GET: download } = await import("@/app/api/videos/[id]/download/route"));
  ({ GET: thumbnail } = await import("@/app/api/videos/[id]/thumbnail/route"));
});

beforeEach(() => cookieMap.clear());

const req = () => new Request("http://localhost/api/videos/x/download");

describe("GET /api/videos/:id/download and /thumbnail", () => {
  it("redirects the browser to the presigned storage URL (302) instead of proxying bytes", async () => {
    await loginFixture();
    const res = await download(req(), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `http://localhost:9000/streamtube-videos/get/${VIDEO_FIXTURE_ID}/processed.mp4`,
    );

    const thumb = await thumbnail(req(), params(VIDEO_FIXTURE_ID));
    expect(thumb.status).toBe(302);
    expect(thumb.headers.get("location")).toContain("thumb.jpg");
  });

  it("passes 404 through and returns 401 without a session", async () => {
    expect((await download(req(), params(VIDEO_FIXTURE_ID))).status).toBe(401);
    await loginFixture();
    expect((await download(req(), params(MISSING_VIDEO_ID))).status).toBe(404);
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { UNCONFIRMED_VIDEO_ID } from "@/mocks/handlers/videos";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let POST: Handler;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/videos/[id]/confirm/route"));
});

beforeEach(() => cookieMap.clear());

const req = () => new Request("http://localhost/api/videos/x/confirm", { method: "POST" });

describe("POST /api/videos/:id/confirm", () => {
  it("returns the uploaded video", async () => {
    await loginFixture();
    const res = await POST(req(), params(VIDEO_FIXTURE_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "uploaded" });
  });

  it("passes 409 VIDEO_UPLOAD_NOT_CONFIRMED through", async () => {
    await loginFixture();
    const res = await POST(req(), params(UNCONFIRMED_VIDEO_ID));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "VIDEO_UPLOAD_NOT_CONFIRMED" });
  });
});

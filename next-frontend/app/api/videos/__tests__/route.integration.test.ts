import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, sessionCleared } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

let GET: (req: Request) => Promise<Response>;
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ GET, POST } = await import("@/app/api/videos/route"));
});

beforeEach(() => cookieMap.clear());

const post = (body: unknown) =>
  new Request("http://localhost/api/videos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET /api/videos", () => {
  it("returns 401 without a session and never calls the upstream", async () => {
    let called = false;
    server.use(
      http.get(`${env.API_URL}/videos`, () => {
        called = true;
        return HttpResponse.json([]);
      }),
    );
    const res = await GET(new Request("http://localhost/api/videos"));
    expect(res.status).toBe(401);
    expect(called).toBe(false);
  });

  it("forwards the session bearer and passes the list through", async () => {
    await loginFixture("token-abc");
    let auth: string | null = null;
    server.use(
      http.get(`${env.API_URL}/videos`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json([{ id: "v" }]);
      }),
    );
    const res = await GET(new Request("http://localhost/api/videos"));
    expect(res.status).toBe(200);
    expect(auth).toBe("Bearer token-abc");
    expect(await res.json()).toEqual([{ id: "v" }]);
  });

  it("refreshes the session once on 401 and retries with the new token", async () => {
    await loginFixture("expired-token");
    const seen: string[] = [];
    server.use(
      http.get(`${env.API_URL}/videos`, ({ request }) => {
        seen.push(request.headers.get("authorization") ?? "");
        return seen.length === 1
          ? HttpResponse.json({ statusCode: 401, error: "UNAUTHORIZED", message: "x" }, { status: 401 })
          : HttpResponse.json([]);
      }),
    );
    const res = await GET(new Request("http://localhost/api/videos"));
    expect(res.status).toBe(200);
    expect(seen).toEqual(["Bearer expired-token", "Bearer new-fixture-access-token"]);
  });

  it("returns 401 and destroys the session when the refresh fails", async () => {
    await loginFixture("expired-token");
    server.use(
      http.get(`${env.API_URL}/videos`, () =>
        HttpResponse.json({ statusCode: 401, error: "UNAUTHORIZED", message: "x" }, { status: 401 }),
      ),
      http.post(`${env.API_URL}/auth/refresh`, () =>
        HttpResponse.json({ statusCode: 401, error: "INVALID_TOKEN", message: "x" }, { status: 401 }),
      ),
    );
    const res = await GET(new Request("http://localhost/api/videos"));
    expect(res.status).toBe(401);
    expect(sessionCleared()).toBe(true);
  });
});

describe("POST /api/videos", () => {
  it("returns 201 with the video and the upload plan", async () => {
    await loginFixture();
    const res = await POST(post({ title: "Meu vídeo", sizeBytes: 1024 }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { video: { id: string; status: string }; upload: { type: string } };
    expect(body.video.id).toBe(VIDEO_FIXTURE_ID);
    expect(body.video.status).toBe("uploading");
    expect(body.upload.type).toBe("single");
  });

  it("returns a multipart plan for large files", async () => {
    await loginFixture();
    const res = await POST(post({ title: "grande", sizeBytes: 250 * 1024 * 1024 }));
    const body = (await res.json()) as { upload: { type: string; parts: unknown[] } };
    expect(body.upload.type).toBe("multipart");
    expect(body.upload.parts).toHaveLength(3);
  });

  it("passes the upstream validation error through with its status", async () => {
    await loginFixture();
    const res = await POST(post({ title: "badrequest" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ statusCode: 400, error: "VALIDATION_ERROR" });
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEPTH_COMMENT_ID, SELF_CHANNEL_ID } from "@/mocks/handlers/social";
import { MISSING_VIDEO_ID } from "@/mocks/handlers/videos";
import { ROOT_COMMENT_ID } from "@/mocks/factories/social";
import { CHANNEL_FIXTURE_ID } from "@/mocks/factories/channels";
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { cookieMap, loginFixture, params } from "@/lib/api/__tests__/session-test-utils";

vi.mock("next/headers", async () =>
  (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule(),
);

type IdHandler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let reactionPut: IdHandler;
let reactionDelete: IdHandler;
let commentsGet: IdHandler;
let commentsPost: IdHandler;
let repliesPost: IdHandler;
let commentDelete: IdHandler;
let subGet: IdHandler;
let subPut: IdHandler;
let socialGet: IdHandler;
let mySubs: () => Promise<Response>;

beforeAll(async () => {
  ({ PUT: reactionPut, DELETE: reactionDelete } = await import("@/app/api/videos/[id]/reaction/route"));
  ({ GET: commentsGet, POST: commentsPost } = await import("@/app/api/videos/[id]/comments/route"));
  ({ POST: repliesPost } = await import("@/app/api/comments/[id]/replies/route"));
  ({ DELETE: commentDelete } = await import("@/app/api/comments/[id]/route"));
  ({ GET: subGet, PUT: subPut } = await import("@/app/api/channels/by-id/[id]/subscription/route"));
  ({ GET: socialGet } = await import("@/app/api/social/videos/[id]/route"));
  ({ GET: mySubs } = await import("@/app/api/me/subscriptions/route"));
});

beforeEach(() => cookieMap.clear());

const json = (method: string, body?: unknown) =>
  new Request("http://localhost/api/x", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

describe("social routes (Fase 06)", () => {
  it("public reads work without a session; writes need one", async () => {
    expect((await commentsGet(json("GET"), params(VIDEO_FIXTURE_ID))).status).toBe(200);
    expect((await subGet(json("GET"), params(CHANNEL_FIXTURE_ID))).status).toBe(200);
    const social = await socialGet(json("GET"), params(VIDEO_FIXTURE_ID));
    expect(social.status).toBe(200);
    expect(await social.json()).toMatchObject({ commentsCount: 2, subscription: { subscribersCount: 42 } });

    expect((await reactionPut(json("PUT", { type: "like" }), params(VIDEO_FIXTURE_ID))).status).toBe(401);
    expect((await commentsPost(json("POST", { body: "x" }), params(VIDEO_FIXTURE_ID))).status).toBe(401);
    expect((await subPut(json("PUT"), params(CHANNEL_FIXTURE_ID))).status).toBe(401);
    expect((await mySubs()).status).toBe(401);
    expect((await socialGet(json("GET"), params(MISSING_VIDEO_ID))).status).toBe(404);
  });

  it("reactions: PUT returns the updated summary with myReaction; DELETE clears it", async () => {
    await loginFixture();
    const liked = await reactionPut(json("PUT", { type: "like" }), params(VIDEO_FIXTURE_ID));
    expect(await liked.json()).toEqual({ likes: 13, dislikes: 1, myReaction: "like" });
    const cleared = await reactionDelete(json("DELETE"), params(VIDEO_FIXTURE_ID));
    expect(await cleared.json()).toMatchObject({ myReaction: null });
  });

  it("comments: create 201, reply 201, depth error 400, delete 403/204", async () => {
    await loginFixture();
    const created = await commentsPost(json("POST", { body: "Oi" }), params(VIDEO_FIXTURE_ID));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ body: "Oi", mine: true });
    expect((await commentsPost(json("POST", { body: "" }), params(VIDEO_FIXTURE_ID))).status).toBe(400);

    const reply = await repliesPost(json("POST", { body: "Resp" }), params(ROOT_COMMENT_ID));
    expect(reply.status).toBe(201);
    const depth = await repliesPost(json("POST", { body: "x" }), params(DEPTH_COMMENT_ID));
    expect(depth.status).toBe(400);
    expect(await depth.json()).toMatchObject({ error: "COMMENT_REPLY_DEPTH" });

    expect((await commentDelete(json("DELETE"), params(ROOT_COMMENT_ID))).status).toBe(403);
    expect((await commentDelete(json("DELETE"), params("ffffffff-ffff-4fff-8fff-ffffffffffff"))).status).toBe(204);
  });

  it("subscriptions: PUT subscribes, self-subscribe is 409, /me/subscriptions lists followed channels", async () => {
    await loginFixture();
    const on = await subPut(json("PUT"), params(CHANNEL_FIXTURE_ID));
    expect(await on.json()).toEqual({ subscribed: true, subscribersCount: 43 });
    const self = await subPut(json("PUT"), params(SELF_CHANNEL_ID));
    expect(self.status).toBe(409);
    const mine = await mySubs();
    expect(mine.status).toBe(200);
    const list = (await mine.json()) as { channel: { nickname: string } }[];
    expect(list[0].channel.nickname).toBe("alice");
  });
});

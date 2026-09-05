import { http, HttpResponse } from "msw";

import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import type { paths } from "@/lib/api/types.gen";
import { env } from "@/lib/env";
import { CHANNEL_FIXTURE_ID } from "@/mocks/factories/channels";
import {
  buildComment,
  buildCommentTree,
  buildFollowedChannel,
  buildReactionSummary,
  buildVideoSocial,
  ROOT_COMMENT_ID,
} from "@/mocks/factories/social";
import { MISSING_VIDEO_ID } from "./videos";

type ReactionOk = paths["/videos/{id}/reactions"]["get"]["responses"][200]["content"]["application/json"];
type CommentsOk = paths["/videos/{id}/comments"]["get"]["responses"][200]["content"]["application/json"];
type CommentOk = paths["/comments/{id}/replies"]["post"]["responses"][201]["content"]["application/json"];
type SubscriptionOk = paths["/channels/{id}/subscription"]["get"]["responses"][200]["content"]["application/json"];
type FollowedOk = paths["/me/subscriptions"]["get"]["responses"][200]["content"]["application/json"];
type SocialOk = paths["/social/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];
type StatsOk = paths["/social/videos"]["get"]["responses"][200]["content"]["application/json"];

// Reserved triggers
export const SELF_CHANNEL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const DEPTH_COMMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function errorEnvelope(statusCode: number, error: string, message: string): ApiErrorEnvelope {
  return { statusCode, error, message, code: null };
}

export const handlers = [
  http.get(`${env.API_URL}/videos/:id/reactions`, ({ params }) =>
    String(params.id) === MISSING_VIDEO_ID
      ? HttpResponse.json(errorEnvelope(404, "VIDEO_NOT_FOUND", "Vídeo não encontrado"), { status: 404 })
      : HttpResponse.json<ReactionOk>(buildReactionSummary()),
  ),
  http.put(`${env.API_URL}/videos/:id/reaction`, async ({ request }) => {
    const { type } = (await request.json()) as { type: "like" | "dislike" };
    return HttpResponse.json<ReactionOk>(
      buildReactionSummary({ likes: type === "like" ? 13 : 12, dislikes: type === "dislike" ? 2 : 1, myReaction: type }),
    );
  }),
  http.delete(`${env.API_URL}/videos/:id/reaction`, () =>
    HttpResponse.json<ReactionOk>(buildReactionSummary({ myReaction: null })),
  ),

  http.get(`${env.API_URL}/videos/:id/comments`, ({ params }) =>
    String(params.id) === MISSING_VIDEO_ID
      ? HttpResponse.json(errorEnvelope(404, "VIDEO_NOT_FOUND", "Vídeo não encontrado"), { status: 404 })
      : HttpResponse.json<CommentsOk>({ items: buildCommentTree(), page: 1, limit: 20, total: 1, commentsCount: 2 }),
  ),
  http.post(`${env.API_URL}/videos/:id/comments`, async ({ request }) => {
    const { body } = (await request.json()) as { body?: string };
    if (!body) {
      return HttpResponse.json(errorEnvelope(400, "VALIDATION_ERROR", "body should not be empty"), { status: 400 });
    }
    return HttpResponse.json<CommentOk>(
      buildComment({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", body, mine: true, reactions: buildReactionSummary({ likes: 0, dislikes: 0 }) }),
      { status: 201 },
    );
  }),
  http.post(`${env.API_URL}/comments/:id/replies`, async ({ params, request }) => {
    if (String(params.id) === DEPTH_COMMENT_ID) {
      return HttpResponse.json(
        errorEnvelope(400, "COMMENT_REPLY_DEPTH", "Só é possível responder a comentários de primeiro nível"),
        { status: 400 },
      );
    }
    const { body } = (await request.json()) as { body: string };
    return HttpResponse.json<CommentOk>(
      buildComment({
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        parentId: String(params.id),
        body,
        mine: true,
        reactions: buildReactionSummary({ likes: 0, dislikes: 0 }),
      }),
      { status: 201 },
    );
  }),
  http.delete(`${env.API_URL}/comments/:id`, ({ params }) =>
    String(params.id) === ROOT_COMMENT_ID
      ? HttpResponse.json(errorEnvelope(403, "COMMENT_FORBIDDEN", "Só o autor pode excluir o comentário"), { status: 403 })
      : new HttpResponse(null, { status: 204 }),
  ),
  http.put(`${env.API_URL}/comments/:id/reaction`, async ({ request }) => {
    const { type } = (await request.json()) as { type: "like" | "dislike" };
    return HttpResponse.json<ReactionOk>(buildReactionSummary({ likes: 3, dislikes: 0, myReaction: type }));
  }),
  http.delete(`${env.API_URL}/comments/:id/reaction`, () =>
    HttpResponse.json<ReactionOk>(buildReactionSummary({ likes: 2, dislikes: 0, myReaction: null })),
  ),

  http.get(`${env.API_URL}/channels/:id/subscription`, () =>
    HttpResponse.json<SubscriptionOk>({ subscribed: false, subscribersCount: 42 }),
  ),
  http.put(`${env.API_URL}/channels/:id/subscription`, ({ params }) =>
    String(params.id) === SELF_CHANNEL_ID
      ? HttpResponse.json(errorEnvelope(409, "SUBSCRIPTION_SELF", "Não é possível inscrever-se no próprio canal"), { status: 409 })
      : HttpResponse.json<SubscriptionOk>({ subscribed: true, subscribersCount: 43 }),
  ),
  http.delete(`${env.API_URL}/channels/:id/subscription`, () =>
    HttpResponse.json<SubscriptionOk>({ subscribed: false, subscribersCount: 42 }),
  ),
  http.get(`${env.API_URL}/me/subscriptions`, () =>
    HttpResponse.json<FollowedOk>([buildFollowedChannel()]),
  ),

  http.get(`${env.API_URL}/social/videos/:id`, ({ params }) =>
    String(params.id) === MISSING_VIDEO_ID
      ? HttpResponse.json(errorEnvelope(404, "VIDEO_NOT_FOUND", "Vídeo não encontrado"), { status: 404 })
      : HttpResponse.json<SocialOk>(buildVideoSocial({ subscription: { subscribed: false, subscribersCount: 42 } })),
  ),
  http.get(`${env.API_URL}/social/videos`, ({ request }) => {
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
    return HttpResponse.json<StatsOk>(
      ids.map((videoId, i) => ({ videoId, likes: i === 0 ? 12 : 0, dislikes: i === 0 ? 1 : 0, commentsCount: i === 0 ? 2 : 0 })),
    );
  }),
];

export { CHANNEL_FIXTURE_ID };

import { http, HttpResponse } from "msw";

import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import type { paths } from "@/lib/api/types.gen";
import { env } from "@/lib/env";
import { buildCategories, buildChannel } from "@/mocks/factories/channels";
import { buildVideoList } from "@/mocks/factories/videos";

type ChannelOk = paths["/channels/me"]["get"]["responses"][200]["content"]["application/json"];
type PublicChannelOk = paths["/channels/{nickname}"]["get"]["responses"][200]["content"]["application/json"];
type PublicVideosOk = paths["/channels/{nickname}/videos"]["get"]["responses"][200]["content"]["application/json"];
type CategoriesOk = paths["/categories"]["get"]["responses"][200]["content"]["application/json"];

// Reserved triggers
export const MISSING_NICKNAME = "ghost";
export const TAKEN_NICKNAME = "taken";

function errorEnvelope(statusCode: number, error: string, message: string): ApiErrorEnvelope {
  return { statusCode, error, message, code: null };
}

export const handlers = [
  http.get(`${env.API_URL}/categories`, () => HttpResponse.json<CategoriesOk>(buildCategories())),

  http.get(`${env.API_URL}/channels/me`, () => HttpResponse.json<ChannelOk>(buildChannel())),

  http.patch(`${env.API_URL}/channels/me`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; nickname?: string; description?: string | null };
    if (body.nickname === TAKEN_NICKNAME) {
      return HttpResponse.json(errorEnvelope(409, "CHANNEL_NICKNAME_TAKEN", "Este nickname já está em uso"), {
        status: 409,
      });
    }
    if (body.nickname !== undefined && !/^[a-z0-9_]{3,50}$/.test(body.nickname)) {
      return HttpResponse.json(errorEnvelope(400, "VALIDATION_ERROR", "nickname deve ter 3–50 caracteres"), {
        status: 400,
      });
    }
    return HttpResponse.json<ChannelOk>(
      buildChannel({
        name: body.name ?? "Alice",
        nickname: body.nickname ?? "alice",
        description: body.description === undefined ? "Canal da Alice" : body.description,
      }),
    );
  }),

  http.get(`${env.API_URL}/channels/:nickname`, ({ params }) => {
    const nickname = String(params.nickname);
    if (nickname === MISSING_NICKNAME) {
      return HttpResponse.json(errorEnvelope(404, "CHANNEL_NOT_FOUND", "Canal não encontrado"), {
        status: 404,
      });
    }
    return HttpResponse.json<PublicChannelOk>(buildChannel({ nickname, name: nickname === "alice" ? "Alice" : nickname }));
  }),

  http.get(`${env.API_URL}/channels/:nickname/videos`, ({ params, request }) => {
    if (String(params.nickname) === MISSING_NICKNAME) {
      return HttpResponse.json(errorEnvelope(404, "CHANNEL_NOT_FOUND", "Canal não encontrado"), {
        status: 404,
      });
    }
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const items = buildVideoList()
      .filter((v) => v.isPublished && v.visibility === "public")
      .map((v) => {
        const { error: _error, ...pub } = v;
        void _error;
        return {
          ...pub,
          channel: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nickname: String(params.nickname), name: "Alice" },
        };
      });
    return HttpResponse.json<PublicVideosOk>({ items: items.slice((page - 1) * limit, page * limit), page, limit, total: items.length });
  }),
];

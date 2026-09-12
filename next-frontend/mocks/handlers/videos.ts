import { http, HttpResponse } from "msw";

import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import type { paths } from "@/lib/api/types.gen";
import { env } from "@/lib/env";
import {
  buildRegisterVideoResponse,
  buildVideo,
  buildVideoList,
  VIDEO_FIXTURE_ID,
} from "@/mocks/factories/videos";

type RegisterOk = paths["/videos"]["post"]["responses"][201]["content"]["application/json"];
type VideoOk = paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];
type ListOk = paths["/videos"]["get"]["responses"][200]["content"]["application/json"];

// Reserved trigger table (shared with E2E — values must not collide across suites).
export const MISSING_VIDEO_ID = "00000000-0000-4000-8000-000000000404";
export const FORBIDDEN_VIDEO_ID = "00000000-0000-4000-8000-000000000403";
export const PROCESSING_VIDEO_ID = "22222222-2222-4222-8222-222222222222";
export const FAILED_VIDEO_ID = "33333333-3333-4333-8333-333333333333";
export const UNCONFIRMED_VIDEO_ID = "00000000-0000-4000-8000-000000000409";
export const BAD_REQUEST_TITLE = "badrequest";
/** Títulos contendo esta marca registram um vídeo que fica em `processing` (para testar polling). */
export const PROCESSING_TITLE_MARK = "[processing]";
const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const PART_SIZE = 100 * 1024 * 1024;
const STREAM_BYTES = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256));

function errorEnvelope(statusCode: number, error: string, message: string): ApiErrorEnvelope {
  return { statusCode, error, message, code: null };
}

type Lookup = { video: VideoOk } | { error: Response };

/** Resolve o vídeo do fixture pelo id, honrando a tabela de ids reservados. */
function videoById(id: string): Lookup {
  switch (id) {
    case MISSING_VIDEO_ID:
      return {
        error: HttpResponse.json(errorEnvelope(404, "VIDEO_NOT_FOUND", "Vídeo não encontrado"), {
          status: 404,
        }),
      };
    case FORBIDDEN_VIDEO_ID:
      return {
        error: HttpResponse.json(
          errorEnvelope(403, "VIDEO_CHANNEL_FORBIDDEN", "Usuário não é dono do canal deste vídeo"),
          { status: 403 },
        ),
      };
    case PROCESSING_VIDEO_ID:
      return { video: buildVideoList()[1] };
    case FAILED_VIDEO_ID:
      return { video: buildVideoList()[2] };
    default:
      return { video: buildVideo({ id }) };
  }
}

export const handlers = [
  // GET /videos
  http.get(`${env.API_URL}/videos`, () => HttpResponse.json<ListOk>(buildVideoList())),

  // POST /videos
  http.post(`${env.API_URL}/videos`, async ({ request }) => {
    const body = (await request.json()) as { title?: string; sizeBytes?: number };
    if (!body.title || body.title === BAD_REQUEST_TITLE) {
      return HttpResponse.json(errorEnvelope(400, "VALIDATION_ERROR", "title should not be empty"), {
        status: 400,
      });
    }
    const id = body.title.includes(PROCESSING_TITLE_MARK) ? PROCESSING_VIDEO_ID : VIDEO_FIXTURE_ID;
    const video = buildVideo({
      id,
      title: body.title,
      status: "uploading",
      durationSec: null,
      sizeBytes: null,
      thumbnailUrl: null,
    });
    if (body.sizeBytes && body.sizeBytes > MULTIPART_THRESHOLD) {
      const nParts = Math.ceil(body.sizeBytes / PART_SIZE);
      return HttpResponse.json<RegisterOk>(
        {
          video,
          upload: {
            type: "multipart",
            uploadId: "fixture-upload-id",
            partSize: PART_SIZE,
            parts: Array.from({ length: nParts }, (_, i) => ({
              partNumber: i + 1,
              url: `http://localhost:9000/streamtube-videos/put/${id}/part-${i + 1}`,
            })),
          },
        },
        { status: 201 },
      );
    }
    return HttpResponse.json<RegisterOk>(
      buildRegisterVideoResponse({
        video,
        upload: { type: "single", url: `http://localhost:9000/streamtube-videos/put/${id}/original` },
      }),
      { status: 201 },
    );
  }),

  // GET /videos/:id
  http.get(`${env.API_URL}/videos/:id`, ({ params }) => {
    const out = videoById(String(params.id));
    return "error" in out ? out.error : HttpResponse.json<VideoOk>(out.video);
  }),

  // DELETE /videos/:id
  http.delete(`${env.API_URL}/videos/:id`, ({ params }) => {
    const out = videoById(String(params.id));
    return "error" in out ? out.error : new HttpResponse(null, { status: 204 });
  }),

  // POST /videos/:id/confirm
  http.post(`${env.API_URL}/videos/:id/confirm`, ({ params }) => {
    const id = String(params.id);
    if (id === UNCONFIRMED_VIDEO_ID) {
      return HttpResponse.json(
        errorEnvelope(409, "VIDEO_UPLOAD_NOT_CONFIRMED", "Arquivo do vídeo não encontrado no storage"),
        { status: 409 },
      );
    }
    const out = videoById(id);
    if ("error" in out) return out.error;
    return HttpResponse.json<VideoOk>(
      buildVideo({ id, status: "uploaded", durationSec: null, sizeBytes: 136166, thumbnailUrl: null }),
    );
  }),

  // POST /videos/:id/multipart/complete
  http.post(`${env.API_URL}/videos/:id/multipart/complete`, async ({ params, request }) => {
    const body = (await request.json()) as { uploadId?: string; parts?: unknown[] };
    if (!body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
      return HttpResponse.json(errorEnvelope(400, "VALIDATION_ERROR", "parts must contain at least 1 elements"), {
        status: 400,
      });
    }
    return HttpResponse.json<VideoOk>(
      buildVideo({ id: String(params.id), status: "uploaded", durationSec: null, thumbnailUrl: null }),
    );
  }),

  // POST /videos/:id/multipart/abort
  http.post(`${env.API_URL}/videos/:id/multipart/abort`, () => new HttpResponse(null, { status: 204 })),

  // GET /videos/:id/stream — honra Range como a API real (206 + Content-Range) ou 200
  http.get(`${env.API_URL}/videos/:id/stream`, ({ params, request }) => {
    const out = videoById(String(params.id));
    if ("error" in out) return out.error;
    const total = STREAM_BYTES.length;
    const range = request.headers.get("range");
    const match = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
    if (range && !match) {
      return HttpResponse.json(errorEnvelope(416, "VIDEO_INVALID_RANGE", "Range solicitado é inválido"), {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
      if (start > end) {
        return HttpResponse.json(errorEnvelope(416, "VIDEO_INVALID_RANGE", "Range solicitado é inválido"), {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      return new HttpResponse(STREAM_BYTES.subarray(start, end + 1), {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
    return new HttpResponse(STREAM_BYTES, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
      },
    });
  }),

  // GET /videos/:id/download e /thumbnail — 302 para o storage, como a API real
  http.get(`${env.API_URL}/videos/:id/download`, ({ params }) => {
    const out = videoById(String(params.id));
    if ("error" in out) return out.error;
    return new HttpResponse(null, {
      status: 302,
      headers: { Location: `http://localhost:9000/streamtube-videos/get/${String(params.id)}/processed.mp4` },
    });
  }),
  http.get(`${env.API_URL}/videos/:id/thumbnail`, ({ params }) => {
    const out = videoById(String(params.id));
    if ("error" in out) return out.error;
    return new HttpResponse(null, {
      status: 302,
      headers: { Location: `http://localhost:9000/streamtube-videos/get/${String(params.id)}/thumb.jpg` },
    });
  }),
];

import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type {
  ListVideosQuery,
  PaginatedVideos,
  RegisterVideoDto,
  RegisterVideoResponse,
} from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

/** Painel: repassa page/limit/status/published ao upstream (validação fica na API). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  for (const key of ["page", "limit", "status", "published"]) {
    const value = url.searchParams.get(key);
    if (value !== null) query[key] = value;
  }
  const result = await withAuth((auth) =>
    upstream.GET("/videos", { headers: auth, params: { query: query as unknown as ListVideosQuery } }),
  );
  if (!result) return unauthorized();

  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<PaginatedVideos>(data);
}

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterVideoDto;

  const result = await withAuth((auth) =>
    upstream.POST("/videos", { headers: auth, body }),
  );
  if (!result) return unauthorized();

  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<RegisterVideoResponse>(data, { status: 201 });
}

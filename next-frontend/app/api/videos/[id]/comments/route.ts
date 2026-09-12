import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth, withOptionalAuth } from "@/lib/api/authorized";
import type { CommentItem, CreateCommentDto, PaginatedComments } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

/** Público (auth opcional para `mine`/`myReaction`). */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const { data, error, response } = await withOptionalAuth((auth) =>
    upstream.GET("/videos/{id}/comments", {
      params: { path: { id }, query: { page, limit } },
      headers: auth,
    }),
  );
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<PaginatedComments>(data);
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as CreateCommentDto;
  const result = await withAuth((auth) =>
    upstream.POST("/videos/{id}/comments", { params: { path: { id } }, headers: auth, body }),
  );
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<CommentItem>(data, { status: 201 });
}

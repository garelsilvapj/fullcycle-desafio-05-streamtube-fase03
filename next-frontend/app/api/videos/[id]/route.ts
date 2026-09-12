import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type { UpdateVideoDto, Video } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.GET("/videos/{id}", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return unauthorized();

  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Video>(data);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.DELETE("/videos/{id}", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return unauthorized();

  const { error, response } = result;
  if (!response.ok) return upstreamError(error, response);
  return new Response(null, { status: 204 });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as UpdateVideoDto;
  const result = await withAuth((auth) =>
    upstream.PATCH("/videos/{id}", { params: { path: { id } }, headers: auth, body }),
  );
  if (!result) return unauthorized();

  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Video>(data);
}

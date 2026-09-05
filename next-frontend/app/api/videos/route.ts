import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type { RegisterVideoDto, RegisterVideoResponse, VideoList } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

export async function GET() {
  const result = await withAuth((auth) => upstream.GET("/videos", { headers: auth }));
  if (!result) return unauthorized();

  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<VideoList>(data);
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

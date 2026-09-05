import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type { CompleteMultipartDto, Video } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as CompleteMultipartDto;
  const result = await withAuth((auth) =>
    upstream.POST("/videos/{id}/multipart/complete", {
      params: { path: { id } },
      headers: auth,
      body,
    }),
  );
  if (!result) return unauthorized();

  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Video>(data);
}

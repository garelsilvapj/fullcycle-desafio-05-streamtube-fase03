import { NextResponse } from "next/server";

import { upstreamError, withOptionalAuth } from "@/lib/api/authorized";
import type { VideoSocial } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

/** Público (auth opcional): reações, comentários e inscrição no canal do vídeo. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { data, error, response } = await withOptionalAuth((auth) =>
    upstream.GET("/social/videos/{id}", { params: { path: { id } }, headers: auth }),
  );
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<VideoSocial>(data);
}

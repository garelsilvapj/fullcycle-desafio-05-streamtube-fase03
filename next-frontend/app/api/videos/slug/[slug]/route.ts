import { NextResponse } from "next/server";

import { upstreamError, withOptionalAuth } from "@/lib/api/authorized";
import type { Video } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ slug: string }> };

/** Público (auth opcional): vídeo publicado pela URL única; o dono vê também os rascunhos. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const { data, error, response } = await withOptionalAuth((auth) =>
    upstream.GET("/videos/slug/{slug}", { params: { path: { slug } }, headers: auth }),
  );
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Video>(data);
}

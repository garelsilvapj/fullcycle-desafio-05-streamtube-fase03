import { NextResponse } from "next/server";

import { upstreamError } from "@/lib/api/authorized";
import type { PublicChannelVideos } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ nickname: string }> };

/** Público: vídeos publicados de um canal (paginado via ?page&limit). */
export async function GET(request: Request, { params }: Params) {
  const { nickname } = await params;
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const { data, error, response } = await upstream.GET("/channels/{nickname}/videos", {
    params: { path: { nickname }, query: { page, limit } },
  });
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<PublicChannelVideos>(data);
}

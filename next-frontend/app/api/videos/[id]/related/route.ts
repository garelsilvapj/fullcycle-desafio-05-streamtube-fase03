import { NextResponse } from "next/server";

import { upstreamError } from "@/lib/api/authorized";
import type { Video } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

/** Público: sugestões da mesma categoria (?limit). */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 8);
  const { data, error, response } = await upstream.GET("/videos/{id}/related", {
    params: { path: { id }, query: { limit } },
  });
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Video[]>(data);
}

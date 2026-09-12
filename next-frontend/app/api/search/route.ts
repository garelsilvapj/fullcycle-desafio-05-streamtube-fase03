import { NextResponse } from "next/server";

import { upstreamError } from "@/lib/api/authorized";
import type { SearchResults } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

/** Público: busca por título e canal (?q&page&limit). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 12);
  const { data, error, response } = await upstream.GET("/search", {
    params: { query: { q, page, limit } },
  });
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<SearchResults>(data);
}

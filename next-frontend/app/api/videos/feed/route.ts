import { NextResponse } from "next/server";

import { upstreamError } from "@/lib/api/authorized";
import type { Feed } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

/** Público: feed da home (?category=slug&page&limit). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 12);
  const { data, error, response } = await upstream.GET("/feed", {
    params: { query: { page, limit, ...(category ? { category } : {}) } },
  });
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Feed>(data);
}

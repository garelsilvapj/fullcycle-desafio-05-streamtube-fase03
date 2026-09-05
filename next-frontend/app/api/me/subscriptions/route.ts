import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type { FollowedChannel } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

export async function GET() {
  const result = await withAuth((auth) => upstream.GET("/me/subscriptions", { headers: auth }));
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<FollowedChannel[]>(data);
}

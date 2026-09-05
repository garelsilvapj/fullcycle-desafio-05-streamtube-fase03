import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type { Channel, UpdateChannelDto } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

export async function GET() {
  const result = await withAuth((auth) => upstream.GET("/channels/me", { headers: auth }));
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Channel>(data);
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as UpdateChannelDto;
  const result = await withAuth((auth) =>
    upstream.PATCH("/channels/me", { headers: auth, body }),
  );
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Channel>(data);
}

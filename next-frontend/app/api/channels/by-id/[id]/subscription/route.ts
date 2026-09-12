import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth, withOptionalAuth } from "@/lib/api/authorized";
import type { SubscriptionState } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { data, error, response } = await withOptionalAuth((auth) =>
    upstream.GET("/channels/{id}/subscription", { params: { path: { id } }, headers: auth }),
  );
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<SubscriptionState>(data);
}

export async function PUT(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.PUT("/channels/{id}/subscription", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<SubscriptionState>(data);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.DELETE("/channels/{id}/subscription", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<SubscriptionState>(data);
}

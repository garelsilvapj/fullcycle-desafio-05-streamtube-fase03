import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type { ReactionSummary, SetReactionDto } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as SetReactionDto;
  const result = await withAuth((auth) =>
    upstream.PUT("/videos/{id}/reaction", { params: { path: { id } }, headers: auth, body }),
  );
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<ReactionSummary>(data);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.DELETE("/videos/{id}/reaction", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<ReactionSummary>(data);
}

import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type { Video } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.POST("/videos/{id}/confirm", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return unauthorized();

  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Video>(data);
}

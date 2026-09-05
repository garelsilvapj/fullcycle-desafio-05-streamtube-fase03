import { NextResponse } from "next/server";

import { upstreamError } from "@/lib/api/authorized";
import type { PublicChannel } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ nickname: string }> };

/** Público: dados do canal por nickname. */
export async function GET(_request: Request, { params }: Params) {
  const { nickname } = await params;
  const { data, error, response } = await upstream.GET("/channels/{nickname}", {
    params: { path: { nickname } },
  });
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<PublicChannel>(data);
}

import { NextResponse } from "next/server";

import {
  unauthorized,
  upstreamError,
  withAuth,
  withOptionalAuth,
} from "@/lib/api/authorized";
import type { CreateThumbnailUploadDto, ThumbnailUploadPlan, Video } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

/**
 * Thumbnail servida (própria ou gerada): repassa o 302 do upstream para a URL pré-assinada.
 * Pública para vídeos publicados; o Bearer da sessão, quando existe, libera os rascunhos do dono.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { error, response } = await withOptionalAuth((auth) =>
    upstream.GET("/videos/{id}/thumbnail", {
      params: { path: { id } },
      headers: auth,
      redirect: "manual",
      parseAs: "text",
    }),
  );
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) {
    return NextResponse.redirect(location, 302);
  }
  return upstreamError(error, response);
}

/** Inicia o upload de uma thumbnail própria: devolve a URL pré-assinada. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as CreateThumbnailUploadDto;
  const result = await withAuth((auth) =>
    upstream.POST("/videos/{id}/thumbnail", {
      params: { path: { id } },
      headers: auth,
      body,
    }),
  );
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<ThumbnailUploadPlan>(data);
}

/** Remove a thumbnail própria (volta à gerada pelo worker). */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.DELETE("/videos/{id}/thumbnail", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return unauthorized();
  const { data, error, response } = result;
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Video>(data);
}

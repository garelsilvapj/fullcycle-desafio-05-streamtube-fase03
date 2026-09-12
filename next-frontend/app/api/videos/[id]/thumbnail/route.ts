import { NextResponse } from "next/server";

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

/** Igual ao download: repassa o 302 do upstream para a URL pré-assinada da thumbnail. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.GET("/videos/{id}/thumbnail", {
      params: { path: { id } },
      headers: auth,
      redirect: "manual",
      parseAs: "text",
    }),
  );
  if (!result) return unauthorized();

  const { error, response } = result;
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) {
    return NextResponse.redirect(location, 302);
  }
  return upstreamError(error, response);
}

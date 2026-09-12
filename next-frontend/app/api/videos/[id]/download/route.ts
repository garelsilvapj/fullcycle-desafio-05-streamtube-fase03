import { NextResponse } from "next/server";

import { upstreamError, withOptionalAuth } from "@/lib/api/authorized";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

/**
 * O upstream responde 302 para uma URL pré-assinada do storage. O BFF repassa o redirect
 * (o navegador baixa direto do storage, sem passar bytes pela API nem pelo Next).
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withOptionalAuth((auth) =>
    upstream.GET("/videos/{id}/download", {
      params: { path: { id } },
      headers: auth,
      redirect: "manual",
      parseAs: "text",
    }),
  );

  const { error, response } = result;
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) {
    return NextResponse.redirect(location, 302);
  }
  return upstreamError(error, response);
}

import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

// Headers que definem a semântica de Range/streaming e devem chegar intactos ao navegador.
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];

/**
 * Proxy de streaming: repassa o header `Range` ao upstream e devolve o corpo como stream,
 * preservando 200/206/416 e os headers de Range. O navegador nunca fala com a API.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const range = request.headers.get("range");

  const result = await withAuth((auth) =>
    upstream.GET("/videos/{id}/stream", {
      params: { path: { id } },
      headers: range ? { ...auth, Range: range } : auth,
      parseAs: "stream",
    }),
  );
  if (!result) return unauthorized();

  const { data, error, response } = result;
  if (!response.ok) return upstreamError(error, response);

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(data ?? null, { status: response.status, headers });
}

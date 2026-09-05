import { upstreamError } from "@/lib/api/authorized";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

/** Público: registra uma visualização (o player chama uma vez por reprodução). */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const { error, response } = await upstream.POST("/videos/{id}/views", {
    params: { path: { id } },
  });
  if (!response.ok) return upstreamError(error, response);
  return new Response(null, { status: 204 });
}

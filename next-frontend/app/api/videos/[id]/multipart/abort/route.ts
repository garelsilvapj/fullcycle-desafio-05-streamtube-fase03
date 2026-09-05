import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import type { AbortMultipartDto } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as AbortMultipartDto;
  const result = await withAuth((auth) =>
    upstream.POST("/videos/{id}/multipart/abort", {
      params: { path: { id } },
      headers: auth,
      body,
    }),
  );
  if (!result) return unauthorized();

  const { error, response } = result;
  if (!response.ok) return upstreamError(error, response);
  return new Response(null, { status: 204 });
}

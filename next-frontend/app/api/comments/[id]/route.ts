import { unauthorized, upstreamError, withAuth } from "@/lib/api/authorized";
import { upstream } from "@/lib/api/upstream";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await withAuth((auth) =>
    upstream.DELETE("/comments/{id}", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return unauthorized();
  const { error, response } = result;
  if (!response.ok) return upstreamError(error, response);
  return new Response(null, { status: 204 });
}

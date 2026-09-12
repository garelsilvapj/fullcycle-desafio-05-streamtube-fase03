import "server-only";
import { NextResponse } from "next/server";

import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import { refreshOnce } from "@/lib/auth/refresh";
import { getSession } from "@/lib/auth/session";

export type AuthHeaders = { Authorization: string };

/**
 * Executa uma chamada autenticada ao upstream com o access token da sessão.
 * Em 401 tenta renovar a sessão uma vez (single-flight) e repete a chamada.
 * Retorna `null` quando não há sessão ou a renovação falhou — o caller responde 401.
 */
export async function withAuth<R extends { response: Response }>(
  call: (auth: AuthHeaders) => Promise<R>,
): Promise<R | null> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.accessToken) return null;

  const first = await call({ Authorization: `Bearer ${session.accessToken}` });
  if (first.response.status !== 401) return first;

  if (!(await refreshOnce())) return null;
  const refreshed = await getSession();
  return call({ Authorization: `Bearer ${refreshed.accessToken}` });
}

export function unauthorized(): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json<ApiErrorEnvelope>(
    { statusCode: 401, error: "UNAUTHORIZED", message: "Session expired", code: null },
    { status: 401 },
  );
}

/** Repassa o envelope de erro do upstream com o mesmo status. */
export function upstreamError(error: unknown, response: Response): NextResponse {
  const body: ApiErrorEnvelope =
    error && typeof error === "object" && "statusCode" in error
      ? (error as ApiErrorEnvelope)
      : {
          statusCode: response.status,
          error: "UPSTREAM_ERROR",
          message: response.statusText || "Upstream error",
          code: null,
        };
  return NextResponse.json<ApiErrorEnvelope>(body, { status: response.status });
}

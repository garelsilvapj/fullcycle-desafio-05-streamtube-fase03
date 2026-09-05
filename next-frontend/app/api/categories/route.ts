import { NextResponse } from "next/server";

import { upstreamError } from "@/lib/api/authorized";
import type { Category } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

/** Público: categorias fixas da plataforma. */
export async function GET() {
  const { data, error, response } = await upstream.GET("/categories");
  if (error || !data) return upstreamError(error, response);
  return NextResponse.json<Category[]>(data);
}

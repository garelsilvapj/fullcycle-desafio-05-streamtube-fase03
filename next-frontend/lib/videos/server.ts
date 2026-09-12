import "server-only";

import { withAuth } from "@/lib/api/authorized";
import type { Video, VideoList } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

/**
 * Leituras server-side (RSC) dos vídeos do canal do usuário. Devolvem `null` quando a sessão
 * expirou (a página redireciona para o login) e `"not-found"` quando o vídeo não existe/não é do canal.
 */
export async function listMyVideos(): Promise<VideoList | null> {
  const result = await withAuth((auth) => upstream.GET("/videos", { headers: auth }));
  if (!result) return null;
  if (result.error || !result.data) {
    throw new Error(`Falha ao listar vídeos (${result.response.status})`);
  }
  return result.data;
}

export async function getMyVideo(id: string): Promise<Video | null | "not-found"> {
  const result = await withAuth((auth) =>
    upstream.GET("/videos/{id}", { params: { path: { id } }, headers: auth }),
  );
  if (!result) return null;
  if (result.response.status === 404 || result.response.status === 403 || result.response.status === 400) {
    return "not-found";
  }
  if (result.error || !result.data) {
    throw new Error(`Falha ao carregar o vídeo (${result.response.status})`);
  }
  return result.data;
}

import "server-only";

import { withAuth, withOptionalAuth } from "@/lib/api/authorized";
import type {
  Category,
  Channel,
  ListVideosQuery,
  PaginatedVideos,
  PublicChannel,
  PublicChannelVideos,
  RelatedVideos,
  Video,
  VideoSocial,
  VideoSocialStats,
  FollowedChannel,
  PaginatedComments,
  SubscriptionState,
} from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

/**
 * Leituras server-side (RSC). Funções autenticadas devolvem `null` quando a sessão expirou (a
 * página redireciona para o login) e `"not-found"` quando o recurso não existe/não é do usuário.
 */
export async function listMyVideos(
  query: Partial<ListVideosQuery> = {},
): Promise<PaginatedVideos | null> {
  const result = await withAuth((auth) =>
    upstream.GET("/videos", { headers: auth, params: { query } }),
  );
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
  if ([400, 403, 404].includes(result.response.status)) return "not-found";
  if (result.error || !result.data) {
    throw new Error(`Falha ao carregar o vídeo (${result.response.status})`);
  }
  return result.data;
}

export async function getMyChannel(): Promise<Channel | null> {
  const result = await withAuth((auth) => upstream.GET("/channels/me", { headers: auth }));
  if (!result) return null;
  if (result.error || !result.data) {
    throw new Error(`Falha ao carregar o canal (${result.response.status})`);
  }
  return result.data;
}

export async function listCategories(): Promise<Category[]> {
  const { data, response } = await upstream.GET("/categories");
  if (!data) throw new Error(`Falha ao listar categorias (${(response as Response).status})`);
  return data;
}

export async function getPublicChannel(nickname: string): Promise<PublicChannel | "not-found"> {
  const { data, error, response } = await upstream.GET("/channels/{nickname}", {
    params: { path: { nickname } },
  });
  if (response.status === 404) return "not-found";
  if (error || !data) throw new Error(`Falha ao carregar o canal (${response.status})`);
  return data;
}

export async function listPublicChannelVideos(
  nickname: string,
  page = 1,
  limit = 24,
): Promise<PublicChannelVideos | "not-found"> {
  const { data, error, response } = await upstream.GET("/channels/{nickname}/videos", {
    params: { path: { nickname }, query: { page, limit } },
  });
  if (response.status === 404) return "not-found";
  if (error || !data) throw new Error(`Falha ao listar vídeos do canal (${response.status})`);
  return data;
}

/** Vídeo público pela URL única (auth opcional: o dono vê rascunhos). */
export async function getVideoBySlug(slug: string): Promise<Video | "not-found"> {
  const { data, error, response } = await withOptionalAuth((auth) =>
    upstream.GET("/videos/slug/{slug}", { params: { path: { slug } }, headers: auth }),
  );
  if (response.status === 404) return "not-found";
  if (error || !data) throw new Error(`Falha ao carregar o vídeo (${response.status})`);
  return data;
}

export async function listRelatedVideos(id: string, limit = 8): Promise<RelatedVideos> {
  const { data, error, response } = await upstream.GET("/videos/{id}/related", {
    params: { path: { id }, query: { limit } },
  });
  if (error || !data) throw new Error(`Falha ao listar sugestões (${response.status})`);
  return data;
}

// ─── Social (Fase 06) ───────────────────────────────────────────────────────────

export async function getVideoSocial(id: string): Promise<VideoSocial | null> {
  const { data, response } = await withOptionalAuth((auth) =>
    upstream.GET("/social/videos/{id}", { params: { path: { id } }, headers: auth }),
  );
  if (response.status === 404) return null;
  if (!data) throw new Error(`Falha ao carregar dados sociais (${response.status})`);
  return data;
}

export async function listComments(videoId: string, page = 1, limit = 20): Promise<PaginatedComments> {
  const { data, response } = await withOptionalAuth((auth) =>
    upstream.GET("/videos/{id}/comments", {
      params: { path: { id: videoId }, query: { page, limit } },
      headers: auth,
    }),
  );
  if (!data) throw new Error(`Falha ao listar comentários (${response.status})`);
  return data;
}

export async function getSubscriptionState(channelId: string): Promise<SubscriptionState> {
  const { data, response } = await withOptionalAuth((auth) =>
    upstream.GET("/channels/{id}/subscription", { params: { path: { id: channelId } }, headers: auth }),
  );
  if (!data) throw new Error(`Falha ao carregar inscrição (${response.status})`);
  return data;
}

export async function listMySubscriptions(): Promise<FollowedChannel[] | null> {
  const result = await withAuth((auth) => upstream.GET("/me/subscriptions", { headers: auth }));
  if (!result) return null;
  if (!result.data) throw new Error(`Falha ao listar inscrições (${result.response.status})`);
  return result.data;
}

/** Contagens sociais para o painel (uma chamada para até 50 vídeos). */
export async function getSocialStats(videoIds: string[]): Promise<Map<string, VideoSocialStats>> {
  if (videoIds.length === 0) return new Map();
  const result = await withAuth((auth) =>
    upstream.GET("/social/videos", { headers: auth, params: { query: { ids: videoIds.join(",") } } }),
  );
  if (!result || !result.data) return new Map();
  return new Map(result.data.map((s) => [s.videoId, s]));
}

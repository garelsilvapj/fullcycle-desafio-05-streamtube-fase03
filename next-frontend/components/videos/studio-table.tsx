import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { VideoStatusBadge } from "@/components/videos/video-status-badge"
import type { PaginatedVideos } from "@/lib/api/contracts"
import { formatDuration, formatRelative } from "@/lib/videos/format"

function pageHref(base: string, page: number, params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  search.set("page", String(page))
  return `${base}?${search.toString()}`
}

/** Painel de gerenciamento (server component): tabela paginada do canal. */
function StudioTable({
  data,
  filters,
}: {
  data: PaginatedVideos
  filters: { status?: string; published?: string }
}) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit))

  if (data.total === 0) {
    return (
      <div data-slot="studio-empty" className="flex flex-col items-start gap-3">
        <p className="text-body-md text-muted-foreground">Nenhum vídeo com esses filtros.</p>
        <Button asChild size="md">
          <Link href="/upload">Enviar vídeo</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-[var(--radius-3)] border border-border">
        <table data-slot="studio-table" className="w-full text-body-md">
          <thead className="bg-muted text-label-md text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Vídeo</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Publicação</th>
              <th className="px-3 py-2 text-right">Views</th>
              <th className="px-3 py-2 text-right">Likes</th>
              <th className="px-3 py-2 text-right">Comentários</th>
              <th className="px-3 py-2 text-left">Enviado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.items.map((video) => (
              <tr key={video.id} data-slot="studio-row" data-status={video.status} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-[var(--radius-1)] bg-muted">
                      {video.thumbnailUrl && (
                        <Image src={`/api/videos/${video.id}/thumbnail`} alt="" fill unoptimized className="object-cover" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-label-lg text-foreground">{video.title}</span>
                      <span className="text-caption text-muted-foreground">
                        {formatDuration(video.durationSec)} · {video.visibility === "unlisted" ? "não listado" : "público"}
                        {video.category ? ` · ${video.category.name}` : ""}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <VideoStatusBadge status={video.status} />
                </td>
                <td className="px-3 py-2">
                  {video.isPublished ? (
                    <span data-slot="published-badge" className="text-foreground">
                      Publicado {formatRelative(video.publishedAt)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Rascunho</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{video.viewsCount}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">0</td>
                <td className="px-3 py-2 text-right text-muted-foreground">0</td>
                <td className="px-3 py-2 text-muted-foreground">{formatRelative(video.createdAt)}</td>
                <td className="px-3 py-2 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/studio/videos/${video.id}`}>Editar</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav aria-label="Paginação" className="flex items-center justify-between text-body-md">
        <span className="text-muted-foreground">
          Página {data.page} de {totalPages} · {data.total} vídeo{data.total === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" disabled={data.page <= 1}>
            <Link href={pageHref("/studio", data.page - 1, filters)} aria-disabled={data.page <= 1}>
              Anterior
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={data.page >= totalPages}>
            <Link href={pageHref("/studio", data.page + 1, filters)} aria-disabled={data.page >= totalPages}>
              Próxima
            </Link>
          </Button>
        </div>
      </nav>
    </div>
  )
}

export { StudioTable }

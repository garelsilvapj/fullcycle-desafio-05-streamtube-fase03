import Image from "next/image"

import type { PublicChannelVideos } from "@/lib/api/contracts"
import { formatDuration, formatRelative } from "@/lib/videos/format"

/**
 * Grid público dos vídeos publicados de um canal. Sem link para a página de visualização
 * (chega na Fase 05 com `/watch/[slug]`).
 */
function PublicVideoGrid({ data }: { data: PublicChannelVideos }) {
  if (data.total === 0) {
    return (
      <p data-slot="public-grid-empty" className="text-body-md text-muted-foreground">
        Este canal ainda não publicou vídeos.
      </p>
    )
  }
  return (
    <ul data-slot="public-video-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.items.map((video) => (
        <li key={video.id} data-slot="public-video-card" className="flex flex-col gap-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-2)] bg-muted">
            {video.thumbnailUrl && (
              <Image src={`/api/videos/${video.id}/thumbnail`} alt="" fill unoptimized className="object-cover" />
            )}
            <span className="absolute bottom-1 right-1 rounded-[var(--radius-1)] bg-black/80 px-1 text-caption text-white">
              {formatDuration(video.durationSec)}
            </span>
          </div>
          <h3 className="line-clamp-2 text-label-lg text-foreground">{video.title}</h3>
          <p className="text-caption text-muted-foreground">
            {video.viewsCount} visualizações · {formatRelative(video.publishedAt)}
            {video.category ? ` · ${video.category.name}` : ""}
          </p>
        </li>
      ))}
    </ul>
  )
}

export { PublicVideoGrid }

import Image from "next/image"
import Link from "next/link"

import type { RelatedVideos } from "@/lib/api/contracts"
import { formatDuration, formatRelative } from "@/lib/videos/format"

/** Sidebar de sugestões (mesma categoria). */
function RelatedVideosList({ videos }: { videos: RelatedVideos }) {
  if (videos.length === 0) {
    return <p className="text-body-md text-muted-foreground">Sem sugestões por enquanto.</p>
  }
  return (
    <ul data-slot="related-videos" className="flex flex-col gap-3">
      {videos.map((video) => (
        <li key={video.id} data-slot="related-video">
          <Link href={`/watch/${video.slug}`} className="flex gap-3 rounded-[var(--radius-2)] hover:bg-muted/40">
            <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-[var(--radius-1)] bg-muted">
              {video.thumbnailUrl && (
                <Image src={`/api/videos/${video.id}/thumbnail`} alt="" fill unoptimized className="object-cover" />
              )}
              <span className="absolute bottom-1 right-1 rounded-[var(--radius-1)] bg-black/80 px-1 text-caption text-white">
                {formatDuration(video.durationSec)}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="line-clamp-2 text-label-lg text-foreground">{video.title}</span>
              {video.channel && <span className="text-caption text-muted-foreground">{video.channel.name}</span>}
              <span className="text-caption text-muted-foreground">
                {video.viewsCount} visualizações · {formatRelative(video.publishedAt)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export { RelatedVideosList }

import Image from "next/image"
import Link from "next/link"

import type { Video } from "@/lib/api/contracts"
import { formatDuration, formatRelative } from "@/lib/videos/format"

/** Card público (home, busca, canal): thumbnail, título, canal, views e tempo de publicação. */
function VideoCard({ video }: { video: Video }) {
  return (
    <article data-slot="video-card-public" className="flex flex-col gap-2">
      <Link href={`/watch/${video.slug}`} className="group flex flex-col gap-2 rounded-[var(--radius-2)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-2)] bg-muted">
          {video.thumbnailUrl && (
            <Image src={`/api/videos/${video.id}/thumbnail`} alt="" fill unoptimized className="object-cover transition-transform group-hover:scale-[1.02]" />
          )}
          <span className="absolute bottom-1 right-1 rounded-[var(--radius-1)] bg-black/80 px-1 text-caption text-white">
            {formatDuration(video.durationSec)}
          </span>
        </div>
        <h3 className="line-clamp-2 text-label-lg text-foreground">{video.title}</h3>
      </Link>
      <div className="flex flex-col text-caption text-muted-foreground">
        {video.channel && (
          <Link href={`/c/${video.channel.nickname}`} className="hover:underline">
            {video.channel.name}
          </Link>
        )}
        <span>
          {video.viewsCount} visualizações · {formatRelative(video.publishedAt)}
        </span>
      </div>
    </article>
  )
}

export { VideoCard }

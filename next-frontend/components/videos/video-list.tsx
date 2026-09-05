"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { VideoStatusBadge } from "@/components/videos/video-status-badge"
import type { Video } from "@/lib/api/contracts"
import { formatBytes, formatDuration } from "@/lib/videos/format"

const IN_PROGRESS = new Set<Video["status"]>(["uploading", "uploaded", "processing"])

/** Lista dos vídeos do canal; recarrega sozinha enquanto houver vídeo em processamento. */
function VideoList({
  videos,
  refreshIntervalMs = 3000,
}: {
  videos: Video[]
  refreshIntervalMs?: number
}) {
  const router = useRouter()
  const hasInProgress = videos.some((v) => IN_PROGRESS.has(v.status))

  React.useEffect(() => {
    if (!hasInProgress) return
    const timer = setInterval(() => router.refresh(), refreshIntervalMs)
    return () => clearInterval(timer)
  }, [hasInProgress, refreshIntervalMs, router])

  if (videos.length === 0) {
    return (
      <div data-slot="video-list-empty" className="flex flex-col items-start gap-3">
        <p className="text-body-md text-muted-foreground">Você ainda não enviou nenhum vídeo.</p>
        <Button asChild size="md">
          <Link href="/upload">Enviar meu primeiro vídeo</Link>
        </Button>
      </div>
    )
  }

  return (
    <ul data-slot="video-list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((video) => (
        <li key={video.id} data-slot="video-card" data-status={video.status}>
          <Link
            href={`/videos/${video.id}`}
            className="flex flex-col gap-2 rounded-[var(--radius-3)] border border-border p-3 hover:bg-muted/40"
          >
            <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-2)] bg-muted">
              {video.thumbnailUrl ? (
                <Image
                  src={`/api/videos/${video.id}/thumbnail`}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-caption text-muted-foreground">
                  sem thumbnail
                </span>
              )}
            </div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="line-clamp-2 text-label-lg text-foreground">{video.title}</h2>
              <VideoStatusBadge status={video.status} />
            </div>
            <p className="text-caption text-muted-foreground">
              {formatDuration(video.durationSec)} · {formatBytes(video.sizeBytes)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export { VideoList }

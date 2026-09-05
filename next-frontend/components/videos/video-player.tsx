"use client"

import type { Video } from "@/lib/api/contracts"

/** Player HTML5: o `src` é o proxy BFF com suporte a Range, então seek funciona sem baixar tudo. */
function VideoPlayer({ video }: { video: Video }) {
  return (
    <video
      data-slot="video-player"
      controls
      preload="metadata"
      playsInline
      poster={video.thumbnailUrl ? `/api/videos/${video.id}/thumbnail` : undefined}
      src={`/api/videos/${video.id}/stream`}
      className="aspect-video w-full rounded-[var(--radius-3)] bg-black"
    >
      Seu navegador não suporta reprodução de vídeo.
    </video>
  )
}

export { VideoPlayer }

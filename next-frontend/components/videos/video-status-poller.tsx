"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import type { Video } from "@/lib/api/contracts"

/** Enquanto o vídeo não estiver ready/failed, consulta o BFF e recarrega a página ao mudar. */
function VideoStatusPoller({ video, intervalMs = 2500 }: { video: Video; intervalMs?: number }) {
  const router = useRouter()
  const done = video.status === "ready" || video.status === "failed"

  React.useEffect(() => {
    if (done) return
    const timer = setInterval(async () => {
      const res = await fetch(`/api/videos/${video.id}`)
      if (!res.ok) return
      const latest = (await res.json()) as Video
      if (latest.status !== video.status) router.refresh()
    }, intervalMs)
    return () => clearInterval(timer)
  }, [done, intervalMs, router, video.id, video.status])

  return null
}

export { VideoStatusPoller }

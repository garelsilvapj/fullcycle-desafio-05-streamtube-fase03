"use client"

import * as React from "react"

/**
 * Registra uma visualização no primeiro `play` do <video> mais próximo (uma vez por carregamento).
 * Fica ao lado do player; encontra o elemento pelo `data-slot`.
 */
function ViewTracker({ videoId }: { videoId: string }) {
  const sent = React.useRef(false)
  React.useEffect(() => {
    const video = document.querySelector<HTMLVideoElement>("video[data-slot='video-player']")
    if (!video) return
    const onPlay = () => {
      if (sent.current) return
      sent.current = true
      void fetch(`/api/videos/${videoId}/views`, { method: "POST", keepalive: true })
    }
    video.addEventListener("play", onPlay)
    return () => video.removeEventListener("play", onPlay)
  }, [videoId])
  return null
}

export { ViewTracker }

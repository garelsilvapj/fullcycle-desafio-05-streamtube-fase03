"use client"

import * as React from "react"

import { VideoCard } from "@/components/discovery/video-card"
import { Button } from "@/components/ui/button"
import type { Feed, Video } from "@/lib/api/contracts"

/**
 * Grid da home com "carregar mais": a primeira página vem do servidor; as seguintes são buscadas
 * no BFF ao clicar ou quando o sentinela entra na viewport (scroll infinito progressivo — TD-07.3).
 */
function FeedGrid({ initial, category }: { initial: Feed; category?: string }) {
  const [items, setItems] = React.useState<Video[]>(initial.items)
  const [page, setPage] = React.useState(initial.page)
  const [total, setTotal] = React.useState(initial.total)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const sentinel = React.useRef<HTMLDivElement>(null)
  const hasMore = items.length < total

  const loadMore = React.useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: String(page + 1), limit: String(initial.limit) })
    if (category) params.set("category", category)
    const res = await fetch(`/api/videos/feed?${params.toString()}`)
    if (!res.ok) {
      setError("Não foi possível carregar mais vídeos.")
    } else {
      const next = (await res.json()) as Feed
      setItems((prev) => [...prev, ...next.items])
      setPage(next.page)
      setTotal(next.total)
    }
    setLoading(false)
  }, [category, hasMore, initial.limit, loading, page])

  React.useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  if (items.length === 0) {
    return (
      <p data-slot="feed-empty" className="text-body-md text-muted-foreground">
        Nenhum vídeo publicado por aqui ainda.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div data-slot="feed-grid" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
      <div ref={sentinel} aria-hidden className="h-1" />
      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="md" onClick={loadMore} disabled={loading} data-slot="load-more">
            {loading ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-center text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export { FeedGrid }

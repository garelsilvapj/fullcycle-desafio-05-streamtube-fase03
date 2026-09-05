"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import type { Video } from "@/lib/api/contracts"
import { readApiError } from "@/lib/videos/errors"
import { formatDateTimeUtc } from "@/lib/videos/format"

/** Publicar / despublicar. Só vídeos `ready` podem ser publicados (TD-04.2). */
function PublishToggle({ video }: { video: Video }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const canPublish = video.status === "ready"

  async function toggle() {
    setPending(true)
    setError(null)
    const action = video.isPublished ? "unpublish" : "publish"
    const res = await fetch(`/api/videos/${video.id}/${action}`, { method: "POST" })
    if (!res.ok) setError(await readApiError(res, "Não foi possível alterar a publicação"))
    else router.refresh()
    setPending(false)
  }

  return (
    <div data-slot="publish-toggle" data-published={video.isPublished} className="flex flex-col gap-2">
      <p className="text-body-md text-foreground">
        {video.isPublished
          ? `Publicado em ${formatDateTimeUtc(video.publishedAt)}`
          : "Rascunho — ainda não está visível no seu canal."}
      </p>
      {!video.isPublished && !canPublish && (
        <p className="text-caption text-muted-foreground">
          Aguarde o processamento terminar para publicar.
        </p>
      )}
      <div>
        <Button
          type="button"
          size="md"
          variant={video.isPublished ? "outline" : "default"}
          onClick={toggle}
          disabled={pending || (!video.isPublished && !canPublish)}
        >
          {pending ? "Aguarde…" : video.isPublished ? "Despublicar" : "Publicar"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export { PublishToggle }

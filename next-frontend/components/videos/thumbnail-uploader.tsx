"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ThumbnailUploadPlan, Video } from "@/lib/api/contracts"
import { readApiError } from "@/lib/videos/errors"
import { putWithProgress } from "@/lib/videos/upload-client"

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]
const MAX_BYTES = 5 * 1024 * 1024

/** Thumbnail própria: plano (BFF) → PUT direto no storage → confirmação (TD-04.4). */
function ThumbnailUploader({ video }: { video: Video }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState(0)

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!ACCEPTED.includes(file.type)) return setError("Use uma imagem JPEG, PNG ou WebP.")
    if (file.size > MAX_BYTES) return setError("A imagem deve ter no máximo 5MB.")

    setBusy(true)
    setError(null)
    try {
      const planRes = await fetch(`/api/videos/${video.id}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      })
      if (!planRes.ok) throw new Error(await readApiError(planRes, "Não foi possível iniciar o envio"))
      const { url } = (await planRes.json()) as ThumbnailUploadPlan
      await putWithProgress(url, file, { contentType: file.type })
      const confirm = await fetch(`/api/videos/${video.id}/thumbnail/confirm`, { method: "POST" })
      if (!confirm.ok) throw new Error(await readApiError(confirm, "A imagem foi recusada"))
      setVersion((v) => v + 1)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/videos/${video.id}/thumbnail`, { method: "DELETE" })
    if (!res.ok) setError(await readApiError(res, "Não foi possível remover a thumbnail"))
    else {
      setVersion((v) => v + 1)
      router.refresh()
    }
    setBusy(false)
  }

  return (
    <div data-slot="thumbnail-uploader" className="flex flex-col gap-3">
      <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-[var(--radius-2)] bg-muted">
        {video.thumbnailUrl ? (
          <Image
            src={`/api/videos/${video.id}/thumbnail?v=${version}`}
            alt="Thumbnail atual"
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-caption text-muted-foreground">
            sem thumbnail ainda
          </span>
        )}
      </div>
      <p className="text-caption text-muted-foreground" data-slot="thumbnail-source">
        {video.hasCustomThumbnail ? "Usando a sua imagem." : "Usando a imagem gerada automaticamente."}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="thumbnail-file">Enviar thumbnail própria (JPEG/PNG/WebP, até 5MB)</Label>
        <Input id="thumbnail-file" type="file" accept={ACCEPTED.join(",")} disabled={busy} onChange={onFile} />
      </div>
      {video.hasCustomThumbnail && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={remove} disabled={busy}>
            Voltar para a thumbnail gerada
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export { ThumbnailUploader }

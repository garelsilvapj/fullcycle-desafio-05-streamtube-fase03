"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import type { ApiErrorEnvelope } from "@/lib/api/contracts"

function DeleteVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function onClick() {
    if (!window.confirm("Excluir este vídeo? Esta ação não pode ser desfeita.")) return
    setPending(true)
    setError(null)
    const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" })
    if (res.ok) {
      router.push("/videos")
      router.refresh()
      return
    }
    const envelope = (await res.json()) as ApiErrorEnvelope
    setError(Array.isArray(envelope.message) ? envelope.message.join(" ") : envelope.message)
    setPending(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="destructive" size="sm" onClick={onClick} disabled={pending} data-slot="delete-video">
        {pending ? "Excluindo…" : "Excluir vídeo"}
      </Button>
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export { DeleteVideoButton }

"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"
import type { ReactionSummary, ReactionType } from "@/lib/api/contracts"
import { readApiError } from "@/lib/videos/errors"

/**
 * Like/dislike com atualização otimista e rollback. `endpoint` é a rota BFF da reação
 * (`/api/videos/:id/reaction` ou `/api/comments/:id/reaction`). Anônimo vê contagens + CTA de login.
 */
function ReactionBar({
  endpoint,
  initial,
  compact = false,
}: {
  endpoint: string
  initial: ReactionSummary
  compact?: boolean
}) {
  const session = useSession()
  const [summary, setSummary] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function react(type: ReactionType) {
    if (!session.isLoggedIn) return
    const previous = summary
    const removing = summary.myReaction === type
    // otimista
    setSummary(optimistic(summary, removing ? null : type))
    setPending(true)
    setError(null)
    const res = await fetch(endpoint, {
      method: removing ? "DELETE" : "PUT",
      headers: removing ? undefined : { "Content-Type": "application/json" },
      body: removing ? undefined : JSON.stringify({ type }),
    })
    if (!res.ok) {
      setSummary(previous)
      setError(await readApiError(res, "Não foi possível registrar a reação"))
    } else {
      setSummary((await res.json()) as ReactionSummary)
    }
    setPending(false)
  }

  const size = compact ? "sm" : "md"
  return (
    <div data-slot="reaction-bar" className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size={size}
        variant={summary.myReaction === "like" ? "default" : "outline"}
        onClick={() => react("like")}
        disabled={pending || !session.isLoggedIn}
        aria-pressed={summary.myReaction === "like"}
        data-slot="like-button"
      >
        👍 {summary.likes}
      </Button>
      <Button
        type="button"
        size={size}
        variant={summary.myReaction === "dislike" ? "default" : "outline"}
        onClick={() => react("dislike")}
        disabled={pending || !session.isLoggedIn}
        aria-pressed={summary.myReaction === "dislike"}
        data-slot="dislike-button"
      >
        👎 {summary.dislikes}
      </Button>
      {!session.isLoggedIn && !compact && (
        <Link href="/login" className="text-caption text-link hover:underline" data-slot="reaction-login-cta">
          Entre para reagir
        </Link>
      )}
      {error && (
        <span role="alert" className="text-caption text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}

function optimistic(summary: ReactionSummary, next: ReactionType | null): ReactionSummary {
  let { likes, dislikes } = summary
  if (summary.myReaction === "like") likes--
  if (summary.myReaction === "dislike") dislikes--
  if (next === "like") likes++
  if (next === "dislike") dislikes++
  return { likes, dislikes, myReaction: next }
}

export { ReactionBar }

"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"
import type { SubscriptionState } from "@/lib/api/contracts"
import { readApiError } from "@/lib/videos/errors"

/** Inscrever-se / cancelar com contagem de inscritos. Anônimo recebe CTA de login. */
function SubscribeButton({ channelId, initial }: { channelId: string; initial: SubscriptionState }) {
  const session = useSession()
  const [state, setState] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function toggle() {
    setPending(true)
    setError(null)
    const res = await fetch(`/api/channels/by-id/${channelId}/subscription`, {
      method: state.subscribed ? "DELETE" : "PUT",
    })
    if (!res.ok) setError(await readApiError(res, "Não foi possível atualizar a inscrição"))
    else setState((await res.json()) as SubscriptionState)
    setPending(false)
  }

  return (
    <div data-slot="subscribe" data-subscribed={state.subscribed} className="flex flex-wrap items-center gap-2">
      {session.isLoggedIn ? (
        <Button type="button" size="sm" variant={state.subscribed ? "outline" : "default"} onClick={toggle} disabled={pending}>
          {pending ? "…" : state.subscribed ? "Inscrito" : "Inscrever-se"}
        </Button>
      ) : (
        <Button asChild size="sm">
          <Link href="/login">Entre para se inscrever</Link>
        </Button>
      )}
      <span data-slot="subscribers-count" className="text-caption text-muted-foreground">
        {state.subscribersCount} inscrito{state.subscribersCount === 1 ? "" : "s"}
      </span>
      {error && (
        <span role="alert" className="text-caption text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}

export { SubscribeButton }

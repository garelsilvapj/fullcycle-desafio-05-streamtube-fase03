"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Input } from "@/components/ui/input"

/** Barra de busca do header: envia para /search?q= (busca por título e canal). */
function SearchForm({ initialQuery = "", className }: { initialQuery?: string; className?: string }) {
  const router = useRouter()
  const [q, setQ] = React.useState(initialQuery)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (term.length < 2) return
    router.push(`/search?q=${encodeURIComponent(term)}`)
  }

  return (
    // action/method: funciona como GET nativo antes da hidratação; com JS, o submit usa o router.
    <form role="search" action="/search" method="get" onSubmit={submit} className={className} data-slot="search-form">
      <Input
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar vídeos ou canais"
        aria-label="Buscar"
        minLength={2}
        className="h-9"
      />
    </form>
  )
}

export { SearchForm }

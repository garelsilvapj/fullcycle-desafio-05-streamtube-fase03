"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const COLLAPSED_CHARS = 220

/** Descrição do vídeo com expandir/recolher (só oferece o botão quando há o que esconder). */
function WatchDescription({ description }: { description: string | null }) {
  const [expanded, setExpanded] = React.useState(false)
  if (!description) {
    return <p className="text-body-md text-muted-foreground">Sem descrição.</p>
  }
  const long = description.length > COLLAPSED_CHARS
  const shown = long && !expanded ? `${description.slice(0, COLLAPSED_CHARS).trimEnd()}…` : description
  return (
    <div data-slot="watch-description" data-expanded={expanded} className="flex flex-col gap-2">
      <p className={cn("whitespace-pre-line text-body-md text-foreground")}>{shown}</p>
      {long && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Mostrar menos" : "Mostrar mais"}
        </Button>
      )}
    </div>
  )
}

export { WatchDescription }

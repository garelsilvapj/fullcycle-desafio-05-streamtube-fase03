"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

/** Recarrega a página (RSC) periodicamente enquanto `active` for true. */
function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter()
  React.useEffect(() => {
    if (!active) return
    const timer = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs, router])
  return null
}

export { AutoRefresh }

"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

function LogoutButton({ className }: { className?: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function onClick() {
    setPending(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      setPending(false)
      router.push("/login")
      router.refresh()
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={pending}
      data-slot="logout-button"
      className={className}
    >
      {pending ? "Saindo…" : "Sair"}
    </Button>
  )
}

export { LogoutButton }

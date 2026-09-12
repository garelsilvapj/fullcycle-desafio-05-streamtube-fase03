"use client"

import Link from "next/link"

import { LogoutButton } from "@/components/auth/logout-button"
import { StreamTubeIcon } from "@/components/icons/streamtube-icon"
import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"

function AppHeader() {
  const session = useSession()

  return (
    <header
      data-slot="app-header"
      className="flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-3"
    >
      <Link href="/" className="flex items-center gap-2 text-h3 text-foreground">
        <StreamTubeIcon className="size-7" />
        StreamTube
      </Link>

      <nav aria-label="Principal" className="flex items-center gap-2">
        {session.isLoggedIn ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/videos">Meus vídeos</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/studio">Studio</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/upload">Enviar vídeo</Link>
            </Button>
            <span className="hidden text-body-md text-muted-foreground sm:inline" data-slot="session-email">
              {session.email}
            </span>
            <LogoutButton />
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Criar conta</Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  )
}

export { AppHeader }

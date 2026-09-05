"use client"

import Link from "next/link"

import { LogoutButton } from "@/components/auth/logout-button"
import { SearchForm } from "@/components/discovery/search-form"
import { StreamTubeIcon } from "@/components/icons/streamtube-icon"
import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"

/** Header responsivo: logo, busca (cresce no centro), navegação (colapsa em telas pequenas). */
function AppHeader() {
  const session = useSession()

  return (
    <header
      data-slot="app-header"
      className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6"
    >
      <Link href="/" className="flex items-center gap-2 text-h3 text-foreground">
        <StreamTubeIcon className="size-7" />
        <span className="hidden sm:inline">StreamTube</span>
      </Link>

      <SearchForm className="order-3 w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xl" />

      <nav aria-label="Principal" className="ml-auto flex items-center gap-1 sm:gap-2">
        {session.isLoggedIn ? (
          <>
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link href="/videos">Meus vídeos</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/studio">Studio</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link href="/subscriptions">Inscrições</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/upload">Enviar</Link>
            </Button>
            <span className="hidden text-body-md text-muted-foreground lg:inline" data-slot="session-email">
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

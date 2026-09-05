import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

// Página inicial mínima (a home com grid, busca e categorias é escopo da Fase 07).
export default async function Home() {
  const session = await getSession();

  return (
    <section className="flex flex-col items-start gap-4 py-12">
      <h1 className="text-display text-foreground">StreamTube</h1>
      <p className="max-w-xl text-body-lg text-muted-foreground">
        Envie vídeos de até 10GB, acompanhe o processamento e assista com streaming.
      </p>
      <div className="flex gap-3">
        {session.isLoggedIn ? (
          <>
            <Button asChild size="md">
              <Link href="/upload">Enviar vídeo</Link>
            </Button>
            <Button asChild variant="outline" size="md">
              <Link href="/videos">Meus vídeos</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild size="md">
              <Link href="/signup">Criar conta</Link>
            </Button>
            <Button asChild variant="outline" size="md">
              <Link href="/login">Entrar</Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

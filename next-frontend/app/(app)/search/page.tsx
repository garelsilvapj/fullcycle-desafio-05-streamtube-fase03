import Link from "next/link";

import { VideoCard } from "@/components/discovery/video-card";
import { Button } from "@/components/ui/button";
import { searchVideos } from "@/lib/videos/server";

export const dynamic = "force-dynamic";

type Search = Promise<{ q?: string; page?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: Search }) {
  const { q } = await searchParams;
  return { title: q ? `"${q}" — Busca — StreamTube` : "Busca — StreamTube" };
}

/** Resultados da busca por título e canal, com paginação clássica (Fase 07). */
export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const { q = "", page: rawPage } = await searchParams;
  const term = q.trim();
  const page = Math.max(1, Number(rawPage ?? 1) || 1);
  const results = term.length >= 2 ? await searchVideos(term, page, 12) : "invalid";

  return (
    <section data-slot="search-page" className="flex flex-col gap-6">
      <h1 className="text-h2 text-foreground">
        {term ? (
          <>
            Resultados para <span className="text-muted-foreground">&ldquo;{term}&rdquo;</span>
          </>
        ) : (
          "Busca"
        )}
      </h1>

      {results === "invalid" ? (
        <p data-slot="search-hint" className="text-body-md text-muted-foreground">
          Digite pelo menos 2 caracteres para buscar por título de vídeo ou nome do canal.
        </p>
      ) : results.total === 0 ? (
        <p data-slot="search-empty" className="text-body-md text-muted-foreground">
          Nenhum vídeo ou canal encontrado para &ldquo;{term}&rdquo;.
        </p>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            {results.total} resultado{results.total === 1 ? "" : "s"}
          </p>
          <div data-slot="search-grid" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.items.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
          {results.total > results.limit && (
            <nav aria-label="Paginação" className="flex items-center justify-between text-body-md">
              <span className="text-muted-foreground">
                Página {results.page} de {Math.ceil(results.total / results.limit)}
              </span>
              <div className="flex gap-2">
                {results.page > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/search?q=${encodeURIComponent(term)}&page=${results.page - 1}`}>Anterior</Link>
                  </Button>
                )}
                {results.page * results.limit < results.total && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/search?q=${encodeURIComponent(term)}&page=${results.page + 1}`}>Próxima</Link>
                  </Button>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

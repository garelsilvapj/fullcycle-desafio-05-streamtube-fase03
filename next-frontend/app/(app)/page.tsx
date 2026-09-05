import Link from "next/link";

import { FeedGrid } from "@/components/discovery/feed-grid";
import { Button } from "@/components/ui/button";
import { getFeed, listCategories } from "@/lib/videos/server";

export const dynamic = "force-dynamic";

type Search = Promise<{ category?: string }>;

/** Home: grid de vídeos públicos com filtro por categoria e "carregar mais" (Fase 07). */
export default async function Home({ searchParams }: { searchParams: Search }) {
  const { category } = await searchParams;
  const slug = category && /^[a-z0-9-]{1,60}$/.test(category) ? category : undefined;
  const [feed, categories] = await Promise.all([getFeed(1, 12, slug), listCategories()]);

  return (
    <section className="flex flex-col gap-6">
      <nav aria-label="Categorias" data-slot="category-chips" className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={!slug ? "secondary" : "ghost"}>
          <Link href="/">Tudo</Link>
        </Button>
        {categories.map((c) => (
          <Button key={c.id} asChild size="sm" variant={slug === c.slug ? "secondary" : "ghost"}>
            <Link href={`/?category=${c.slug}`}>{c.name}</Link>
          </Button>
        ))}
      </nav>
      <FeedGrid key={slug ?? "all"} initial={feed} category={slug} />
    </section>
  );
}

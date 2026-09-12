import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AutoRefresh } from "@/components/videos/auto-refresh";
import { StudioTable } from "@/components/videos/studio-table";
import { requireSession } from "@/lib/auth/require-session";
import { getMyChannel, listMyVideos } from "@/lib/videos/server";

export const metadata = { title: "Studio — StreamTube" };
export const dynamic = "force-dynamic";

const STATUSES = ["uploading", "uploaded", "processing", "ready", "failed"] as const;
const IN_PROGRESS = new Set(["uploading", "uploaded", "processing"]);

type Search = Promise<{ page?: string; status?: string; published?: string }>;

export default async function StudioPage({ searchParams }: { searchParams: Search }) {
  await requireSession();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const status = STATUSES.includes(params.status as (typeof STATUSES)[number]) ? params.status : undefined;
  const published = params.published === "true" || params.published === "false" ? params.published : undefined;

  const [data, channel] = await Promise.all([
    listMyVideos({
      page,
      limit: 10,
      ...(status ? { status: status as (typeof STATUSES)[number] } : {}),
      ...(published ? { published: published === "true" } : {}),
    }),
    getMyChannel(),
  ]);
  if (!data || !channel) redirect("/login");

  const filterHref = (next: { status?: string; published?: string }) => {
    const search = new URLSearchParams();
    if (next.status) search.set("status", next.status);
    if (next.published) search.set("published", next.published);
    const qs = search.toString();
    return qs ? `/studio?${qs}` : "/studio";
  };

  return (
    <section className="flex flex-col gap-6">
      <AutoRefresh active={data.items.some((v) => IN_PROGRESS.has(v.status))} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 text-foreground">Studio</h1>
          <p className="text-body-md text-muted-foreground">
            Canal <Link href={`/c/${channel.nickname}`} className="text-link hover:underline">@{channel.nickname}</Link>{" "}
            · {channel.videosCount} publicado{channel.videosCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/studio/channel">Editar canal</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/upload">Enviar vídeo</Link>
          </Button>
        </div>
      </div>

      <nav aria-label="Filtros" className="flex flex-wrap gap-2 text-label-md">
        <Button asChild variant={!status && !published ? "secondary" : "ghost"} size="sm">
          <Link href="/studio">Todos</Link>
        </Button>
        <Button asChild variant={published === "true" ? "secondary" : "ghost"} size="sm">
          <Link href={filterHref({ status, published: "true" })}>Publicados</Link>
        </Button>
        <Button asChild variant={published === "false" ? "secondary" : "ghost"} size="sm">
          <Link href={filterHref({ status, published: "false" })}>Rascunhos</Link>
        </Button>
        <Button asChild variant={status === "processing" ? "secondary" : "ghost"} size="sm">
          <Link href={filterHref({ status: "processing", published })}>Processando</Link>
        </Button>
        <Button asChild variant={status === "failed" ? "secondary" : "ghost"} size="sm">
          <Link href={filterHref({ status: "failed", published })}>Com falha</Link>
        </Button>
      </nav>

      <StudioTable data={data} filters={{ status, published }} />
    </section>
  );
}

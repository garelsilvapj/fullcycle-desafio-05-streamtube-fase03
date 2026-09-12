import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/require-session";
import { formatDuration, formatRelative } from "@/lib/videos/format";
import { listMySubscriptions } from "@/lib/videos/server";

export const metadata = { title: "Inscrições — StreamTube" };
export const dynamic = "force-dynamic";

/** Canais seguidos com acesso rápido aos últimos vídeos. */
export default async function SubscriptionsPage() {
  await requireSession();
  const followed = await listMySubscriptions();
  if (!followed) redirect("/login");

  return (
    <section data-slot="subscriptions-page" className="flex flex-col gap-6">
      <h1 className="text-h2 text-foreground">Inscrições</h1>
      {followed.length === 0 ? (
        <p data-slot="subscriptions-empty" className="text-body-md text-muted-foreground">
          Você ainda não segue nenhum canal. Inscreva-se a partir da página de um vídeo ou de um canal.
        </p>
      ) : (
        <ul className="flex flex-col gap-8">
          {followed.map((item) => (
            <li key={item.channel.id} data-slot="followed-channel" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <Link href={`/c/${item.channel.nickname}`} className="text-h3 text-foreground hover:underline">
                    {item.channel.name}
                  </Link>
                  <span className="text-caption text-muted-foreground">
                    @{item.channel.nickname} · {item.subscribersCount} inscrito{item.subscribersCount === 1 ? "" : "s"}
                  </span>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/c/${item.channel.nickname}`}>Ver canal</Link>
                </Button>
              </div>
              {item.latestVideos.length === 0 ? (
                <p className="text-body-md text-muted-foreground">Sem vídeos publicados ainda.</p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {item.latestVideos.map((video) => (
                    <li key={video.id}>
                      <Link href={`/watch/${video.slug}`} className="flex flex-col gap-2 rounded-[var(--radius-2)] hover:bg-muted/40">
                        <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-2)] bg-muted">
                          {video.thumbnailUrl && (
                            <Image src={`/api/videos/${video.id}/thumbnail`} alt="" fill unoptimized className="object-cover" />
                          )}
                          <span className="absolute bottom-1 right-1 rounded-[var(--radius-1)] bg-black/80 px-1 text-caption text-white">
                            {formatDuration(video.durationSec)}
                          </span>
                        </div>
                        <span className="line-clamp-2 text-label-lg text-foreground">{video.title}</span>
                        <span className="text-caption text-muted-foreground">{formatRelative(video.publishedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

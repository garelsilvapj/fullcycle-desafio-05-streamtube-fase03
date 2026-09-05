import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PublicVideoGrid } from "@/components/videos/public-video-grid";
import { SubscribeButton } from "@/components/social/subscribe-button";
import { getPublicChannel, getSubscriptionState, listPublicChannelVideos } from "@/lib/videos/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ nickname: string }>;
  searchParams: Promise<{ page?: string }>;
};

/** Página pública do canal: acessível sem login. */
export default async function PublicChannelPage({ params, searchParams }: Props) {
  const { nickname } = await params;
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage ?? 1) || 1);
  const [channel, videos] = await Promise.all([
    getPublicChannel(nickname),
    listPublicChannelVideos(nickname, page),
  ]);
  if (channel === "not-found" || videos === "not-found") notFound();
  const subscription = await getSubscriptionState(channel.id);
  const totalPages = Math.max(1, Math.ceil(videos.total / videos.limit));

  return (
    <section data-slot="public-channel" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <h1 className="text-h1 text-foreground">{channel.name}</h1>
        <p className="text-body-md text-muted-foreground">
          @{channel.nickname} · {channel.videosCount} vídeo{channel.videosCount === 1 ? "" : "s"}
        </p>
        <SubscribeButton channelId={channel.id} initial={subscription} />
        {channel.description && (
          <p className="max-w-2xl whitespace-pre-line text-body-md text-foreground">{channel.description}</p>
        )}
      </header>

      <PublicVideoGrid data={videos} />

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-between text-body-md">
          <span className="text-muted-foreground">
            Página {videos.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {videos.page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/c/${nickname}?page=${videos.page - 1}`}>Anterior</Link>
              </Button>
            )}
            {videos.page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/c/${nickname}?page=${videos.page + 1}`}>Próxima</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </section>
  );
}

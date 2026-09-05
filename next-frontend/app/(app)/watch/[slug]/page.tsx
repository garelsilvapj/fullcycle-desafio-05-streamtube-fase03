import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CommentsSection } from "@/components/social/comments-section";
import { ReactionBar } from "@/components/social/reaction-bar";
import { SubscribeButton } from "@/components/social/subscribe-button";
import { RelatedVideosList } from "@/components/videos/related-videos";
import { VideoPlayer } from "@/components/videos/video-player";
import { ViewTracker } from "@/components/videos/view-tracker";
import { WatchDescription } from "@/components/videos/watch-description";
import { formatRelative } from "@/lib/videos/format";
import { getVideoBySlug, getVideoSocial, listComments, listRelatedVideos } from "@/lib/videos/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
  return { title: video === "not-found" ? "Vídeo não encontrado — StreamTube" : `${video.title} — StreamTube` };
}

/** Página pública de visualização (acesso anônimo). Vídeos unlisted abrem só pela URL. */
export default async function WatchPage({ params }: Props) {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
  if (video === "not-found") notFound();
  const published = video.status === "ready" && video.isPublished;
  const [related, social, comments] = published
    ? await Promise.all([listRelatedVideos(video.id), getVideoSocial(video.id), listComments(video.id)])
    : [[], null, null];

  return (
    <div data-slot="watch-page" className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <article className="flex flex-col gap-4">
        {video.status === "ready" ? (
          <>
            <VideoPlayer video={video} />
            <ViewTracker videoId={video.id} />
          </>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-[var(--radius-3)] bg-muted text-body-md text-muted-foreground">
            Este vídeo ainda está sendo processado.
          </div>
        )}

        <header className="flex flex-col gap-2">
          <h1 className="text-h2 text-foreground">{video.title}</h1>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p data-slot="watch-meta" className="text-body-md text-muted-foreground">
              {video.viewsCount} visualizações · {formatRelative(video.publishedAt)}
              {video.category ? ` · ${video.category.name}` : ""}
              {video.visibility === "unlisted" ? " · não listado" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {social && <ReactionBar endpoint={`/api/videos/${video.id}/reaction`} initial={social.reactions} />}
              <Button asChild variant="outline" size="sm">
                <a href={`/api/videos/${video.id}/download`} data-slot="download-link">
                  Baixar
                </a>
              </Button>
            </div>
          </div>
          {video.channel && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/c/${video.channel.nickname}`}
                data-slot="watch-channel"
                className="text-label-lg text-foreground hover:underline"
              >
                {video.channel.name} <span className="text-muted-foreground">@{video.channel.nickname}</span>
              </Link>
              {social && <SubscribeButton channelId={video.channel.id} initial={social.subscription} />}
            </div>
          )}
        </header>

        <section className="rounded-[var(--radius-2)] bg-muted/40 p-4">
          <WatchDescription description={video.description} />
        </section>

        {comments && <CommentsSection videoId={video.id} initial={comments} />}
      </article>

      <aside className="flex flex-col gap-3">
        <h2 className="text-h3 text-foreground">Sugestões</h2>
        <RelatedVideosList videos={related} />
      </aside>
    </div>
  );
}

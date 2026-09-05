import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DeleteVideoButton } from "@/components/videos/delete-video-button";
import { VideoPlayer } from "@/components/videos/video-player";
import { VideoStatusBadge } from "@/components/videos/video-status-badge";
import { VideoStatusPoller } from "@/components/videos/video-status-poller";
import { requireSession } from "@/lib/auth/require-session";
import { formatBytes, formatDuration } from "@/lib/videos/format";
import { getMyVideo } from "@/lib/videos/server";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const video = await getMyVideo(id);
  if (video === null) redirect("/login");
  if (video === "not-found") notFound();

  return (
    <article className="flex flex-col gap-6">
      <VideoStatusPoller video={video} />

      {video.status === "ready" ? (
        <VideoPlayer video={video} />
      ) : (
        <div
          data-slot="video-pending"
          className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-3)] bg-muted"
        >
          <VideoStatusBadge status={video.status} />
          <p role="status" className="text-body-md text-muted-foreground">
            {video.status === "failed"
              ? "O processamento deste vídeo falhou."
              : "Este vídeo ainda está sendo processado. A página atualiza sozinha."}
          </p>
          {video.status === "failed" && video.error && (
            <p role="alert" className="text-caption text-destructive">
              {video.error}
            </p>
          )}
        </div>
      )}

      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-h2 text-foreground">{video.title}</h1>
          <VideoStatusBadge status={video.status} />
        </div>
        <p className="text-caption text-muted-foreground">
          {formatDuration(video.durationSec)} · {formatBytes(video.sizeBytes)} · /watch/{video.slug}
        </p>
        {video.description && (
          <p className="whitespace-pre-line text-body-md text-foreground">{video.description}</p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {video.status === "ready" && (
          <Button asChild variant="outline" size="sm">
            <a href={`/api/videos/${video.id}/download`} data-slot="download-link">
              Baixar MP4
            </a>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href="/videos">Voltar para meus vídeos</Link>
        </Button>
        {video.status !== "processing" && <DeleteVideoButton videoId={video.id} />}
      </div>
    </article>
  );
}

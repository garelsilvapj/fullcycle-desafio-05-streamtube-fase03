import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteVideoButton } from "@/components/videos/delete-video-button";
import { PublishToggle } from "@/components/videos/publish-toggle";
import { ThumbnailUploader } from "@/components/videos/thumbnail-uploader";
import { VideoEditForm } from "@/components/videos/video-edit-form";
import { VideoStatusBadge } from "@/components/videos/video-status-badge";
import { VideoStatusPoller } from "@/components/videos/video-status-poller";
import { requireSession } from "@/lib/auth/require-session";
import { getMyVideo, listCategories } from "@/lib/videos/server";

export const dynamic = "force-dynamic";

export default async function StudioVideoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const [video, categories] = await Promise.all([getMyVideo(id), listCategories()]);
  if (video === null) redirect("/login");
  if (video === "not-found") notFound();

  return (
    <section className="flex flex-col gap-6">
      <VideoStatusPoller video={video} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-h2 text-foreground">Editar vídeo</h1>
          <VideoStatusBadge status={video.status} />
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/studio">Voltar ao Studio</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/videos/${video.id}`}>Ver vídeo</Link>
          </Button>
          {video.isPublished && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/watch/${video.slug}`}>Ver como público</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="gap-6 p-6">
          <VideoEditForm video={video} categories={categories} />
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="gap-4 p-6">
            <h2 className="text-h3 text-foreground">Publicação</h2>
            <PublishToggle video={video} />
          </Card>
          <Card className="gap-4 p-6">
            <h2 className="text-h3 text-foreground">Thumbnail</h2>
            <ThumbnailUploader video={video} />
          </Card>
          {video.status !== "processing" && (
            <Card className="gap-4 p-6">
              <h2 className="text-h3 text-foreground">Zona de perigo</h2>
              <DeleteVideoButton videoId={video.id} />
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}

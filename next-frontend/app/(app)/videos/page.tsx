import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { VideoList } from "@/components/videos/video-list";
import { requireSession } from "@/lib/auth/require-session";
import { listMyVideos } from "@/lib/videos/server";

export const metadata = { title: "Meus vídeos — StreamTube" };
export const dynamic = "force-dynamic";

export default async function MyVideosPage() {
  await requireSession();
  const videos = await listMyVideos();
  if (!videos) redirect("/login");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-h2 text-foreground">Meus vídeos</h1>
        <Button asChild size="sm">
          <Link href="/upload">Enviar vídeo</Link>
        </Button>
      </div>
      <VideoList videos={videos} />
    </section>
  );
}

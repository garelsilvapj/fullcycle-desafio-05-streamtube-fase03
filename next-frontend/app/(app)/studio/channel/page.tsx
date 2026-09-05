import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChannelEditForm } from "@/components/channels/channel-edit-form";
import { requireSession } from "@/lib/auth/require-session";
import { getMyChannel } from "@/lib/videos/server";

export const metadata = { title: "Meu canal — StreamTube" };
export const dynamic = "force-dynamic";

export default async function StudioChannelPage() {
  await requireSession();
  const channel = await getMyChannel();
  if (!channel) redirect("/login");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h2 text-foreground">Meu canal</h1>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/studio">Voltar ao Studio</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/c/${channel.nickname}`}>Ver página pública</Link>
          </Button>
        </div>
      </div>
      <Card className="w-full max-w-2xl gap-6 p-6">
        <ChannelEditForm channel={channel} />
      </Card>
    </section>
  );
}

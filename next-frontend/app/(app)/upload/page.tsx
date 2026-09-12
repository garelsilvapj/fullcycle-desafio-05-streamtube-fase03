import { Card } from "@/components/ui/card";
import { UploadForm } from "@/components/videos/upload-form";
import { requireSession } from "@/lib/auth/require-session";

export const metadata = { title: "Enviar vídeo — StreamTube" };

export default async function UploadPage() {
  await requireSession();

  return (
    <Card className="w-full max-w-2xl gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 text-foreground">Enviar vídeo</h1>
        <p className="text-body-md text-muted-foreground">
          O arquivo vai direto para o storage; depois o vídeo é processado em segundo plano.
        </p>
      </div>
      <UploadForm />
    </Card>
  );
}

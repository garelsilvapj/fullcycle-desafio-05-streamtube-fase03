"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { FieldError } from "@/components/auth/field-error"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VideoStatusBadge } from "@/components/videos/video-status-badge"
import { useVideoUpload, type UploadPhase } from "@/hooks/use-video-upload"
import { cn } from "@/lib/utils"

// Espelho das regras do CreateVideoDto (título ≤200, descrição ≤5000, arquivo ≤10GB).
const MAX_SIZE_BYTES = 10 * 1024 * 1024 * 1024

const uploadSchema = z.object({
  title: z.string().trim().min(1, "Informe um título").max(200, "Título com no máximo 200 caracteres"),
  description: z.string().max(5000, "Descrição com no máximo 5000 caracteres").optional(),
  file: z
    .custom<FileList>((v) => typeof FileList !== "undefined" && v instanceof FileList, "Selecione um arquivo")
    .refine((list) => list.length === 1, "Selecione um arquivo de vídeo")
    .refine((list) => list.length === 0 || list[0].size > 0, "O arquivo está vazio")
    .refine((list) => list.length === 0 || list[0].size <= MAX_SIZE_BYTES, "O arquivo excede 10GB"),
})

type UploadValues = z.infer<typeof uploadSchema>

const PHASE_TEXT: Record<UploadPhase, string> = {
  idle: "",
  registering: "Registrando o vídeo…",
  uploading: "Enviando o arquivo para o storage…",
  confirming: "Confirmando o upload…",
  processing: "Processando (thumbnail e conversão para MP4)…",
  ready: "Vídeo pronto!",
  failed: "O processamento falhou.",
  error: "Não foi possível enviar o vídeo.",
  canceled: "Upload cancelado.",
}

function UploadForm({ className, ...props }: React.ComponentProps<"form">) {
  const { state, start, cancel, reset, isBusy } = useVideoUpload()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UploadValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { title: "", description: "" },
  })

  async function onSubmit(values: UploadValues) {
    await start({ title: values.title, description: values.description, file: values.file[0] })
  }

  const showProgress = state.phase !== "idle"

  return (
    <form
      data-slot="upload-form"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex w-full flex-col gap-4", className)}
      {...props}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          placeholder="Título do vídeo"
          aria-invalid={!!errors.title}
          disabled={isBusy}
          {...register("title")}
        />
        <FieldError message={errors.title?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição (opcional)</Label>
        <textarea
          id="description"
          rows={4}
          disabled={isBusy}
          aria-invalid={!!errors.description}
          className="rounded-[var(--radius-2)] border border-input bg-transparent px-3 py-2 text-body-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          {...register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Arquivo de vídeo (até 10GB)</Label>
        <Input
          id="file"
          type="file"
          accept="video/*"
          aria-invalid={!!errors.file}
          disabled={isBusy}
          {...register("file")}
        />
        <FieldError message={errors.file?.message as string | undefined} />
      </div>

      {showProgress && (
        <div data-slot="upload-status" data-phase={state.phase} className="flex flex-col gap-2">
          <p role="status" className="text-body-md text-foreground">
            {PHASE_TEXT[state.phase]}
          </p>
          {(state.phase === "uploading" || state.phase === "confirming") && (
            <progress
              value={state.progress}
              max={100}
              aria-label="Progresso do upload"
              className="h-2 w-full"
            />
          )}
          {state.video && (
            <div className="flex items-center gap-2 text-body-md">
              <VideoStatusBadge status={state.video.status} />
              {state.phase === "ready" && (
                <Link href={`/videos/${state.video.id}`} className="text-link hover:underline">
                  Assistir
                </Link>
              )}
            </div>
          )}
          {(state.phase === "error" || state.phase === "failed") && state.error && (
            <p role="alert" data-slot="form-error" className="text-caption text-destructive">
              {state.error}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {isBusy ? (
          <Button type="button" variant="outline" size="md" onClick={cancel}>
            Cancelar
          </Button>
        ) : state.phase === "idle" ? (
          <Button type="submit" size="md">
            Enviar vídeo
          </Button>
        ) : (
          <Button type="button" size="md" onClick={reset}>
            Enviar outro vídeo
          </Button>
        )}
      </div>
    </form>
  )
}

export { UploadForm, uploadSchema }

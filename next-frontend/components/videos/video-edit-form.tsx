"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { FieldError } from "@/components/auth/field-error"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Category, UpdateVideoDto, Video } from "@/lib/api/contracts"
import { readApiError } from "@/lib/videos/errors"
import { cn } from "@/lib/utils"

// Espelho do UpdateVideoDto (título ≤200, descrição ≤5000, categoria opcional, visibilidade).
const editSchema = z.object({
  title: z.string().trim().min(1, "Informe um título").max(200, "Título com no máximo 200 caracteres"),
  description: z.string().max(5000, "Descrição com no máximo 5000 caracteres"),
  categoryId: z.string(),
  visibility: z.enum(["public", "unlisted"]),
})
type EditValues = z.infer<typeof editSchema>

function VideoEditForm({
  video,
  categories,
  className,
}: {
  video: Video
  categories: Category[]
  className?: string
}) {
  const router = useRouter()
  const [saved, setSaved] = React.useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: video.title,
      description: video.description ?? "",
      categoryId: video.category?.id ?? "",
      visibility: video.visibility,
    },
  })

  async function onSubmit(values: EditValues) {
    setSaved(false)
    const body: UpdateVideoDto = {
      title: values.title,
      description: values.description.trim() === "" ? null : values.description,
      categoryId: values.categoryId === "" ? null : values.categoryId,
      visibility: values.visibility,
    }
    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      setError("root.serverError", {
        type: "server",
        message: await readApiError(res, "Não foi possível salvar as alterações"),
      })
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form
      data-slot="video-edit-form"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex w-full flex-col gap-4", className)}
    >
      {errors.root?.serverError?.message && (
        <p role="alert" data-slot="form-error" className="text-caption text-destructive">
          {errors.root.serverError.message}
        </p>
      )}
      {saved && (
        <p role="status" className="text-caption text-foreground">
          Alterações salvas.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título</Label>
        <Input id="title" aria-invalid={!!errors.title} {...register("title")} />
        <FieldError message={errors.title?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição</Label>
        <textarea
          id="description"
          rows={5}
          aria-invalid={!!errors.description}
          className="rounded-[var(--radius-2)] border border-input bg-transparent px-3 py-2 text-body-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          {...register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoryId">Categoria</Label>
        <select
          id="categoryId"
          className="rounded-[var(--radius-2)] border border-input bg-transparent px-3 py-2 text-body-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          {...register("categoryId")}
        >
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label-md text-foreground">Visibilidade</legend>
        <label className="flex items-center gap-2 text-body-md">
          <input type="radio" value="public" {...register("visibility")} />
          Público — aparece no canal e nas listagens
        </label>
        <label className="flex items-center gap-2 text-body-md">
          <input type="radio" value="unlisted" {...register("visibility")} />
          Não listado — só quem tem o link
        </label>
      </fieldset>

      <div>
        <Button type="submit" size="md" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}

export { VideoEditForm, editSchema }

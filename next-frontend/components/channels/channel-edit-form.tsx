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
import type { ApiErrorEnvelope, Channel, UpdateChannelDto } from "@/lib/api/contracts"
import { cn } from "@/lib/utils"

// Espelho do UpdateChannelDto.
const channelSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do canal").max(50, "Nome com no máximo 50 caracteres"),
  nickname: z
    .string()
    .regex(/^[a-z0-9_]{3,50}$/, "Use 3–50 caracteres: letras minúsculas, dígitos e _")
    .refine((v) => v !== "me", "Este nickname é reservado"),
  description: z.string().max(1000, "Descrição com no máximo 1000 caracteres"),
})
type ChannelValues = z.infer<typeof channelSchema>

function ChannelEditForm({ channel, className }: { channel: Channel; className?: string }) {
  const router = useRouter()
  const [saved, setSaved] = React.useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ChannelValues>({
    resolver: zodResolver(channelSchema),
    defaultValues: {
      name: channel.name,
      nickname: channel.nickname,
      description: channel.description ?? "",
    },
  })

  async function onSubmit(values: ChannelValues) {
    setSaved(false)
    const body: UpdateChannelDto = {
      name: values.name,
      nickname: values.nickname,
      description: values.description.trim() === "" ? null : values.description,
    }
    const res = await fetch("/api/channels/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const envelope = (await res.json()) as ApiErrorEnvelope
      const message = Array.isArray(envelope.message) ? envelope.message.join(" ") : envelope.message
      if (envelope.statusCode === 409) setError("nickname", { type: "server", message })
      else setError("root.serverError", { type: "server", message })
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form
      data-slot="channel-edit-form"
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
          Canal atualizado.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome do canal</Label>
        <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nickname">Nickname (URL pública: /c/nickname)</Label>
        <Input id="nickname" aria-invalid={!!errors.nickname} {...register("nickname")} />
        <FieldError message={errors.nickname?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição</Label>
        <textarea
          id="description"
          rows={4}
          aria-invalid={!!errors.description}
          className="rounded-[var(--radius-2)] border border-input bg-transparent px-3 py-2 text-body-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          {...register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>
      <div>
        <Button type="submit" size="md" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Salvando…" : "Salvar canal"}
        </Button>
      </div>
    </form>
  )
}

export { ChannelEditForm, channelSchema }

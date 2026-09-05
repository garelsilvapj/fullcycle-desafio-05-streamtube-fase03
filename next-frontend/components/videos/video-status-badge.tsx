import type { VideoStatus } from "@/lib/api/contracts"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<VideoStatus, string> = {
  uploading: "Enviando",
  uploaded: "Na fila",
  processing: "Processando",
  ready: "Pronto",
  failed: "Falhou",
}

const STATUS_CLASS: Record<VideoStatus, string> = {
  uploading: "bg-muted text-muted-foreground",
  uploaded: "bg-muted text-muted-foreground",
  processing: "bg-secondary text-secondary-foreground",
  ready: "bg-primary text-primary-foreground",
  failed: "bg-destructive text-destructive-foreground",
}

export function videoStatusLabel(status: VideoStatus): string {
  return STATUS_LABEL[status]
}

function VideoStatusBadge({
  status,
  className,
}: {
  status: VideoStatus
  className?: string
}) {
  return (
    <span
      data-slot="video-status-badge"
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-[var(--radius-full)] px-2 py-0.5 text-label-md",
        STATUS_CLASS[status],
        className
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export { VideoStatusBadge }

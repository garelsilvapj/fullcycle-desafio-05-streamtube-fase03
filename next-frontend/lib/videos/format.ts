export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** "há 3 dias", "há 2 horas", "agora" — para "publicado há" e "enviado há". */
export function formatRelative(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—"
  const diffSec = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  const units: [number, string, string][] = [
    [60, "segundo", "segundos"],
    [60, "minuto", "minutos"],
    [24, "hora", "horas"],
    [30, "dia", "dias"],
    [12, "mês", "meses"],
  ]
  let value = diffSec
  if (value < 45) return "agora"
  for (const [size, singular, plural] of units) {
    if (value < size) return `há ${value} ${value === 1 ? singular : plural}`
    value = Math.floor(value / size)
  }
  return `há ${value} ${value === 1 ? "ano" : "anos"}`
}

/** Data/hora determinística (UTC) — igual no servidor e no navegador, sem risco de hidratação. */
export function formatDateTimeUtc(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

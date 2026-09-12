import type { ApiErrorEnvelope } from "@/lib/api/contracts"

/** Extrai a mensagem legível de um envelope de erro do BFF (ou um fallback). */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const envelope = (await res.json()) as ApiErrorEnvelope
    const message = Array.isArray(envelope.message) ? envelope.message.join(" ") : envelope.message
    return message || fallback
  } catch {
    return fallback
  }
}

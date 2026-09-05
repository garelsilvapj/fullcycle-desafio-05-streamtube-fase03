"use client";

import * as React from "react";

import type {
  ApiErrorEnvelope,
  RegisterVideoDto,
  RegisterVideoResponse,
  UploadPlan,
  Video,
} from "@/lib/api/contracts";
import { UploadAbortedError, uploadByPlan } from "@/lib/videos/upload-client";

export type UploadPhase =
  | "idle"
  | "registering"
  | "uploading"
  | "confirming"
  | "processing"
  | "ready"
  | "failed"
  | "error"
  | "canceled";

export interface VideoUploadState {
  phase: UploadPhase;
  /** 0–100 durante `uploading`. */
  progress: number;
  video: Video | null;
  error: string | null;
}

export interface StartUploadInput {
  title: string;
  description?: string;
  file: File;
}

export interface UseVideoUploadOptions {
  /** Intervalo (ms) do polling de status após confirmar. */
  pollIntervalMs?: number;
}

const TERMINAL: ReadonlySet<UploadPhase> = new Set(["ready", "failed", "error", "canceled", "idle"]);

function flattenMessage(message: ApiErrorEnvelope["message"]): string {
  return Array.isArray(message) ? message.join(" ") : message;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const envelope = (await res.json()) as ApiErrorEnvelope;
    return flattenMessage(envelope.message) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Orquestra o fluxo de upload pelo BFF: registrar → PUT direto no storage (URL pré-assinada)
 * → confirmar (single) ou multipart/complete → polling do status até ready/failed.
 */
export function useVideoUpload({ pollIntervalMs = 2000 }: UseVideoUploadOptions = {}) {
  const [state, setState] = React.useState<VideoUploadState>({
    phase: "idle",
    progress: 0,
    video: null,
    error: null,
  });
  const abortRef = React.useRef<AbortController | null>(null);
  const cleanupRef = React.useRef<(() => Promise<void>) | null>(null);

  const patch = React.useCallback((partial: Partial<VideoUploadState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const pollUntilDone = React.useCallback(
    async (id: string, signal: AbortSignal): Promise<Video> => {
      for (;;) {
        if (signal.aborted) throw new UploadAbortedError();
        const res = await fetch(`/api/videos/${id}`, { signal });
        if (!res.ok) throw new Error(await readError(res, "Falha ao consultar o status do vídeo"));
        const video = (await res.json()) as Video;
        patch({ video });
        if (video.status === "ready" || video.status === "failed") return video;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, pollIntervalMs);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new UploadAbortedError());
            },
            { once: true },
          );
        });
      }
    },
    [patch, pollIntervalMs],
  );

  const start = React.useCallback(
    async ({ title, description, file }: StartUploadInput): Promise<void> => {
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;
      setState({ phase: "registering", progress: 0, video: null, error: null });

      let plan: UploadPlan | null = null;
      let video: Video | null = null;
      try {
        const body: RegisterVideoDto = { title, description: description || undefined, sizeBytes: file.size };
        const registered = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
        if (!registered.ok) {
          throw new Error(await readError(registered, "Não foi possível registrar o vídeo"));
        }
        const { video: created, upload } = (await registered.json()) as RegisterVideoResponse;
        video = created;
        plan = upload;
        patch({ phase: "uploading", video: created });

        // Cancelamento: descarta o multipart em aberto ou o rascunho single (nunca enviado).
        cleanupRef.current = async () => {
          if (!video) return;
          if (plan?.type === "multipart") {
            await fetch(`/api/videos/${video.id}/multipart/abort`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uploadId: plan.uploadId }),
            }).catch(() => undefined);
          } else {
            await fetch(`/api/videos/${video.id}`, { method: "DELETE" }).catch(() => undefined);
          }
        };

        const parts = await uploadByPlan(upload, file, {
          signal,
          contentType: file.type || "video/mp4",
          onProgress: ({ loaded, total }) => {
            patch({ progress: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0 });
          },
        });

        patch({ phase: "confirming", progress: 100 });
        const confirmUrl =
          upload.type === "multipart"
            ? `/api/videos/${created.id}/multipart/complete`
            : `/api/videos/${created.id}/confirm`;
        const confirmed = await fetch(confirmUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: upload.type === "multipart" ? JSON.stringify({ uploadId: upload.uploadId, parts }) : undefined,
          signal,
        });
        if (!confirmed.ok) throw new Error(await readError(confirmed, "Não foi possível confirmar o upload"));
        cleanupRef.current = null;
        patch({ phase: "processing", video: (await confirmed.json()) as Video });

        const done = await pollUntilDone(created.id, signal);
        patch({ phase: done.status === "ready" ? "ready" : "failed", video: done, error: done.error ?? null });
      } catch (err) {
        if (err instanceof UploadAbortedError || (err instanceof DOMException && err.name === "AbortError")) {
          const cleanup = cleanupRef.current;
          cleanupRef.current = null;
          if (cleanup) await cleanup();
          patch({ phase: "canceled", error: null });
          return;
        }
        patch({ phase: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        abortRef.current = null;
      }
    },
    [patch, pollUntilDone],
  );

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = React.useCallback(() => {
    setState({ phase: "idle", progress: 0, video: null, error: null });
  }, []);

  return { state, start, cancel, reset, isBusy: !TERMINAL.has(state.phase) };
}

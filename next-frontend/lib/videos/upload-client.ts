import type {
  CompletedPart,
  MultipartUploadPlan,
  SingleUploadPlan,
  UploadPlan,
} from "@/lib/api/contracts";

export interface UploadProgress {
  /** Bytes já enviados (somando todas as partes). */
  loaded: number;
  total: number;
}

export interface PutOptions {
  contentType?: string;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

export class UploadAbortedError extends Error {
  constructor() {
    super("Upload cancelado");
    this.name = "UploadAbortedError";
  }
}

export class UploadFailedError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UploadFailedError";
  }
}

/**
 * PUT de um blob numa URL pré-assinada via XMLHttpRequest (fetch não expõe progresso de upload).
 * Resolve com o ETag devolvido pelo storage (necessário no multipart).
 */
export function putWithProgress(
  url: string,
  body: Blob,
  { contentType, signal, onProgress }: PutOptions = {},
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadAbortedError());

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (event) => {
      onProgress?.({ loaded: event.loaded, total: event.lengthComputable ? event.total : body.size });
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: body.size, total: body.size });
        resolve({ etag: xhr.getResponseHeader("ETag") });
      } else {
        reject(new UploadFailedError(`Storage respondeu ${xhr.status} ao enviar o arquivo`, xhr.status));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new UploadFailedError("Falha de rede ao enviar o arquivo para o storage"));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new UploadAbortedError());
    };

    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(body);
  });
}

export async function uploadSingle(
  plan: SingleUploadPlan,
  file: Blob,
  options: PutOptions = {},
): Promise<void> {
  await putWithProgress(plan.url, file, { contentType: options.contentType ?? "video/mp4", ...options });
}

export interface MultipartOptions extends PutOptions {
  /** Partes enviadas em paralelo (default 3). */
  concurrency?: number;
}

/**
 * Envia cada parte (fatias sequenciais de `partSize`) com paralelismo limitado, agregando o
 * progresso total, e devolve os ETags ordenados para o `multipart/complete`.
 */
export async function uploadMultipart(
  plan: MultipartUploadPlan,
  file: Blob,
  { concurrency = 3, signal, onProgress }: MultipartOptions = {},
): Promise<CompletedPart[]> {
  const loadedByPart = new Map<number, number>();
  const report = () => {
    let loaded = 0;
    for (const value of loadedByPart.values()) loaded += value;
    onProgress?.({ loaded, total: file.size });
  };

  const queue = plan.parts.slice().sort((a, b) => a.partNumber - b.partNumber);
  const completed: CompletedPart[] = [];

  async function worker(): Promise<void> {
    for (;;) {
      const part = queue.shift();
      if (!part) return;
      const start = (part.partNumber - 1) * plan.partSize;
      const chunk = file.slice(start, Math.min(start + plan.partSize, file.size));
      const { etag } = await putWithProgress(part.url, chunk, {
        signal,
        onProgress: ({ loaded }) => {
          loadedByPart.set(part.partNumber, loaded);
          report();
        },
      });
      if (!etag) throw new UploadFailedError(`Storage não devolveu ETag para a parte ${part.partNumber}`);
      completed.push({ partNumber: part.partNumber, etag });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  return completed.sort((a, b) => a.partNumber - b.partNumber);
}

/** Despacha para single ou multipart conforme o plano devolvido pela API. */
export async function uploadByPlan(
  plan: UploadPlan,
  file: Blob,
  options: MultipartOptions = {},
): Promise<CompletedPart[] | null> {
  if (plan.type === "multipart") return uploadMultipart(plan, file, options);
  await uploadSingle(plan, file, options);
  return null;
}

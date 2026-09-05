/**
 * XMLHttpRequest falso para testar o cliente de upload (fetch não expõe progresso de upload).
 * Cada `send()` registra a instância e, por padrão, responde no próximo tick com `autoRespond`.
 */
type ProgressHandler = (event: { loaded: number; total: number; lengthComputable: boolean }) => void;

export interface FakeResponse {
  status: number;
  etag?: string | null;
  /** Emite `onerror` em vez de `onload`. */
  networkError?: boolean;
}

export class FakeXHR {
  static instances: FakeXHR[] = [];
  static autoRespond: FakeResponse | null = { status: 200, etag: '"etag-fixture"' };

  static reset(): void {
    FakeXHR.instances = [];
    FakeXHR.autoRespond = { status: 200, etag: '"etag-fixture"' };
  }

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: Blob | null = null;
  status = 0;
  private etag: string | null = null;
  upload: { onprogress: ProgressHandler | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  send(body: Blob): void {
    this.body = body;
    FakeXHR.instances.push(this);
    const auto = FakeXHR.autoRespond;
    if (auto) queueMicrotask(() => this.respond(auto));
  }

  /** Simula progresso parcial e a resposta final. */
  respond({ status, etag = null, networkError = false }: FakeResponse): void {
    const total = this.body?.size ?? 0;
    this.upload.onprogress?.({ loaded: Math.floor(total / 2), total, lengthComputable: true });
    if (networkError) {
      this.onerror?.();
      return;
    }
    this.status = status;
    this.etag = etag;
    this.onload?.();
  }

  abort(): void {
    this.onabort?.();
  }

  getResponseHeader(name: string): string | null {
    return name.toLowerCase() === "etag" ? this.etag : null;
  }
}

import { randomUUID } from 'crypto';
import storageConfig from '../config/storage.config';
import { StorageService } from './storage.service';

/**
 * Integração real com o MinIO do compose. As URLs pré-assinadas são consumidas de dentro do
 * container, então o "endpoint público" aqui é o próprio endpoint interno.
 */
const MiB = 1024 * 1024;

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('StorageService (integration, MinIO)', () => {
  const base = storageConfig();
  const cfg = {
    ...base,
    publicEndpoint: base.endpoint,
    multipartThreshold: 5 * MiB,
    multipartPartSize: 5 * MiB,
  };
  const service = new StorageService(cfg);
  const prefix = `it-${randomUUID()}`;
  const created: string[] = [];
  const key = (name: string) => {
    const k = `${prefix}/${name}`;
    created.push(k);
    return k;
  };

  afterAll(async () => {
    await service.deleteObjects(created);
  });

  it('presigned PUT uploads an object that head() then sees with the right size', async () => {
    const k = key('single.bin');
    const url = await service.createPresignedUpload(
      k,
      'application/octet-stream',
    );
    expect(url).toContain(cfg.bucket);
    const body = Buffer.alloc(3 * 1024, 7);
    const res = await fetch(url, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'application/octet-stream' },
    });
    expect(res.status).toBe(200);

    await expect(service.head(k)).resolves.toEqual({ size: body.length });
  });

  it('head() returns null for a missing key', async () => {
    await expect(service.head(`${prefix}/missing`)).resolves.toBeNull();
  });

  it('getRange() returns exactly the requested bytes and getObject() the whole object', async () => {
    const k = key('range.bin');
    const body = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));
    await service.put(k, body, 'video/mp4');

    const range = await service.getRange(k, 100, 355);
    expect(range.contentLength).toBe(256);
    expect(range.contentType).toBe('video/mp4');
    expect(await readAll(range.stream)).toEqual(body.subarray(100, 356));

    const whole = await service.getObject(k);
    expect(whole.contentLength).toBe(body.length);
    expect(await readAll(whole.stream)).toEqual(body);
  });

  it('presigned download URL serves the object', async () => {
    const k = key('download.bin');
    await service.put(k, Buffer.from('hello'), 'text/plain');
    const url = await service.createPresignedDownload(k);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
  });

  it('multipart: parts uploaded through presigned URLs are assembled by complete()', async () => {
    const k = key('multipart.bin');
    const size = 7 * MiB; // 2 partes: 5MiB + 2MiB
    expect(service.needsMultipart(size)).toBe(true);
    const plan = await service.createMultipartUpload(k, size, 'video/mp4');
    expect(plan.parts.map((p) => p.partNumber)).toEqual([1, 2]);

    const data = Buffer.alloc(size, 9);
    const etags: { partNumber: number; etag: string }[] = [];
    for (const part of plan.parts) {
      const start = (part.partNumber - 1) * plan.partSize;
      const chunk = data.subarray(start, Math.min(start + plan.partSize, size));
      const res = await fetch(part.url, { method: 'PUT', body: chunk });
      expect(res.status).toBe(200);
      etags.push({
        partNumber: part.partNumber,
        etag: res.headers.get('etag') as string,
      });
    }

    await service.completeMultipartUpload(k, plan.uploadId, etags);
    await expect(service.head(k)).resolves.toEqual({ size });
  }, 60_000);

  it('multipart abort discards the upload (object never appears)', async () => {
    const k = key('aborted.bin');
    const plan = await service.createMultipartUpload(k, 6 * MiB);
    await service.abortMultipartUpload(k, plan.uploadId);
    await expect(service.head(k)).resolves.toBeNull();
  });

  it('deleteObjects() removes existing keys and tolerates missing ones', async () => {
    const k = key('todelete.bin');
    await service.put(k, Buffer.from('x'), 'text/plain');
    await service.deleteObjects([k, `${prefix}/never-existed`]);
    await expect(service.head(k)).resolves.toBeNull();
  });

  it('signs client URLs with the public endpoint, not the internal one', async () => {
    const publicService = new StorageService({
      ...cfg,
      publicEndpoint: 'http://localhost:9000',
    });
    const url = await publicService.createPresignedUpload(`${prefix}/x`);
    expect(new URL(url).host).toBe('localhost:9000');
  });
});

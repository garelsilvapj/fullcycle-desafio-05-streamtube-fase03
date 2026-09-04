/** Object storage (MinIO/S3): download do original e upload dos artefatos (multipart automático). */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import type { WorkerConfig } from './config';

export interface ObjectStorage {
  download(key: string, destPath: string): Promise<void>;
  upload(key: string, sourcePath: string, contentType: string): Promise<void>;
  destroy(): void;
}

export function createObjectStorage(cfg: WorkerConfig['s3']): ObjectStorage {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  });

  return {
    async download(key, destPath) {
      const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
      if (!out.Body) throw new Error(`objeto ${key} sem corpo`);
      await pipeline(out.Body as Readable, createWriteStream(destPath));
    },
    async upload(key, sourcePath, contentType) {
      // `Upload` faz multipart automaticamente para arquivos grandes (PutObject único é limitado a 5GB).
      await new Upload({
        client,
        params: {
          Bucket: cfg.bucket,
          Key: key,
          Body: createReadStream(sourcePath),
          ContentType: contentType,
        },
        queueSize: 4,
        partSize: 64 * 1024 * 1024,
      }).done();
    },
    destroy: () => client.destroy(),
  };
}

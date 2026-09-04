import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface MultipartPlan {
  uploadId: string;
  partSize: number;
  parts: { partNumber: number; url: string }[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}
import { Readable } from 'stream';
import storageConfig from '../config/storage.config';

@Injectable()
export class StorageService {
  private readonly client: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly cfg: ConfigType<typeof storageConfig>,
  ) {
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
    });
  }

  /** URL pré-assinada para o cliente subir o arquivo direto no storage (PUT). */
  async createPresignedUpload(
    key: string,
    contentType = 'video/mp4',
  ): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, cmd, {
      expiresIn: this.cfg.presignExpiresSec,
    });
  }

  /** URL pré-assinada de download. */
  async createPresignedDownload(key: string): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key });
    return getSignedUrl(this.client, cmd, {
      expiresIn: this.cfg.presignExpiresSec,
    });
  }

  /** Confere se o objeto existe e retorna o tamanho (para confirmar o upload). */
  async head(key: string): Promise<{ size: number } | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      return { size: Number(out.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }

  /** Lê uma faixa (Range) do objeto — usado pelo streaming (206 Partial Content). */
  async getRange(
    key: string,
    start: number,
    end: number,
  ): Promise<{ stream: Readable; contentLength: number; contentType: string }> {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    );
    return {
      stream: out.Body as Readable,
      contentLength: Number(out.ContentLength ?? 0),
      contentType: out.ContentType ?? 'application/octet-stream',
    };
  }

  /** true se o tamanho declarado exige multipart (acima do threshold). */
  needsMultipart(sizeBytes: number): boolean {
    return sizeBytes > this.cfg.multipartThreshold;
  }

  /**
   * Inicia um upload multipart e devolve o uploadId + URLs pré-assinadas de cada parte.
   * O cliente sobe cada parte (PUT na url), coleta os ETags e chama completeMultipart.
   */
  async createMultipartUpload(
    key: string,
    sizeBytes: number,
    contentType = 'video/mp4',
  ): Promise<MultipartPlan> {
    const created = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    const uploadId = created.UploadId as string;
    const partSize = this.cfg.multipartPartSize;
    const nParts = Math.max(1, Math.ceil(sizeBytes / partSize));
    const parts: { partNumber: number; url: string }[] = [];
    for (let partNumber = 1; partNumber <= nParts; partNumber++) {
      const url = await getSignedUrl(
        this.client,
        new UploadPartCommand({
          Bucket: this.cfg.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: this.cfg.presignExpiresSec },
      );
      parts.push({ partNumber, url });
    }
    return { uploadId, partSize, parts };
  }

  /** Finaliza o upload multipart montando o objeto a partir das partes enviadas. */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  /** Cancela um upload multipart, descartando as partes já enviadas. */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  /** Sobe um buffer (usado pelo worker para thumbnail/mp4 processado). */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}

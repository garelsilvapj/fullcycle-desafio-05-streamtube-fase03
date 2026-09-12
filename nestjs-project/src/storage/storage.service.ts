import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import storageConfig from '../config/storage.config';

export interface MultipartPlan {
  uploadId: string;
  partSize: number;
  parts: { partNumber: number; url: string }[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface StoredObject {
  stream: Readable;
  contentLength: number;
  contentType: string;
}

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const VIDEO_CONTENT_TYPE = 'video/mp4';

function isNotFoundError(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchKey' ||
    e?.$metadata?.httpStatusCode === 404
  );
}

@Injectable()
export class StorageService {
  /** Cliente para operações da própria API (endpoint interno da rede Docker). */
  private readonly client: S3Client;
  /**
   * Cliente usado apenas para ASSINAR URLs entregues ao cliente final. A assinatura
   * inclui o host, então precisa ser gerada com o endpoint que o navegador/host alcança.
   */
  private readonly signingClient: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly cfg: ConfigType<typeof storageConfig>,
  ) {
    this.client = this.buildClient(cfg.endpoint);
    this.signingClient =
      cfg.publicEndpoint === cfg.endpoint
        ? this.client
        : this.buildClient(cfg.publicEndpoint);
  }

  private buildClient(endpoint: string): S3Client {
    return new S3Client({
      endpoint,
      region: this.cfg.region,
      forcePathStyle: this.cfg.forcePathStyle,
      credentials: {
        accessKeyId: this.cfg.accessKey,
        secretAccessKey: this.cfg.secretKey,
      },
    });
  }

  /** URL pré-assinada para o cliente subir o arquivo direto no storage (PUT). */
  async createPresignedUpload(
    key: string,
    contentType = VIDEO_CONTENT_TYPE,
  ): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.signingClient, cmd, {
      expiresIn: this.cfg.presignExpiresSec,
    });
  }

  /** URL pré-assinada de download (GET). */
  async createPresignedDownload(key: string): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key });
    return getSignedUrl(this.signingClient, cmd, {
      expiresIn: this.cfg.presignExpiresSec,
    });
  }

  /**
   * Confere se o objeto existe e retorna o tamanho. Retorna `null` apenas quando o
   * storage responde "não existe"; qualquer outro erro (rede, credenciais) propaga.
   */
  async head(key: string): Promise<{ size: number } | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      return { size: Number(out.ContentLength ?? 0) };
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  /** Lê o objeto inteiro como stream. */
  async getObject(key: string): Promise<StoredObject> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
    );
    return {
      stream: out.Body as Readable,
      contentLength: Number(out.ContentLength ?? 0),
      contentType: out.ContentType ?? DEFAULT_CONTENT_TYPE,
    };
  }

  /** Lê uma faixa (Range, inclusiva) do objeto — usado pelo streaming (206). */
  async getRange(
    key: string,
    start: number,
    end: number,
  ): Promise<StoredObject> {
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
      contentType: out.ContentType ?? DEFAULT_CONTENT_TYPE,
    };
  }

  /** Remove um conjunto de objetos (ignora chaves inexistentes). */
  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.cfg.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  /** true se o tamanho declarado exige multipart (acima do threshold). */
  needsMultipart(sizeBytes: number): boolean {
    return sizeBytes > this.cfg.multipartThreshold;
  }

  /**
   * Inicia um upload multipart e devolve o uploadId + URLs pré-assinadas de cada parte.
   * O cliente sobe cada parte (PUT na url), coleta os ETags e chama completeMultipartUpload.
   */
  async createMultipartUpload(
    key: string,
    sizeBytes: number,
    contentType = VIDEO_CONTENT_TYPE,
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
    const partNumbers = Array.from({ length: nParts }, (_, i) => i + 1);
    const parts = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          this.signingClient,
          new UploadPartCommand({
            Bucket: this.cfg.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: this.cfg.presignExpiresSec },
        ),
      })),
    );
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

  /** Sobe um buffer diretamente (uso interno / testes). */
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

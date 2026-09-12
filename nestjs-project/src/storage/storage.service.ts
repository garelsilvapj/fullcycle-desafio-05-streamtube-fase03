import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

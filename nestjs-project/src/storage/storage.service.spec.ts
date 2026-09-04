import type { ConfigType } from '@nestjs/config';
import {
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
import storageConfig from '../config/storage.config';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const MiB = 1024 * 1024;

function makeConfig(
  overrides: Partial<ConfigType<typeof storageConfig>> = {},
): ConfigType<typeof storageConfig> {
  return {
    endpoint: 'http://minio:9000',
    publicEndpoint: 'http://localhost:9000',
    region: 'us-east-1',
    accessKey: 'k',
    secretKey: 's',
    bucket: 'bucket',
    forcePathStyle: true,
    presignExpiresSec: 600,
    multipartThreshold: 100 * MiB,
    multipartPartSize: 100 * MiB,
    ...overrides,
  };
}

type SendMock = jest.SpyInstance<Promise<unknown>, [command: unknown]>;

describe('StorageService', () => {
  const signed = getSignedUrl as unknown as jest.Mock;
  let send: SendMock;

  beforeEach(() => {
    jest.clearAllMocks();
    signed.mockImplementation(
      (_client: S3Client, cmd: { constructor: { name: string } }) =>
        Promise.resolve(`signed:${cmd.constructor.name}`),
    );
    send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
  });

  afterEach(() => send.mockRestore());

  describe('clientes', () => {
    it('assina URLs com um cliente do endpoint público, distinto do interno', async () => {
      const service = new StorageService(makeConfig());
      await service.createPresignedUpload('k');
      const [clientUsed] = signed.mock.calls[0] as [S3Client];
      const internal = (service as unknown as { client: S3Client }).client;
      expect(clientUsed).not.toBe(internal);
      await expect(clientUsed.config.endpoint?.()).resolves.toMatchObject({
        hostname: 'localhost',
        port: 9000,
      });
    });

    it('reutiliza o cliente interno quando os endpoints coincidem', async () => {
      const service = new StorageService(
        makeConfig({ publicEndpoint: 'http://minio:9000' }),
      );
      await service.createPresignedDownload('k');
      const [clientUsed] = signed.mock.calls[0] as [S3Client];
      const internal = (service as unknown as { client: S3Client }).client;
      expect(clientUsed).toBe(internal);
    });
  });

  describe('presign', () => {
    it('createPresignedUpload assina um PutObject com bucket, key e content-type', async () => {
      const service = new StorageService(makeConfig());
      const url = await service.createPresignedUpload('videos/a/b/original');
      expect(url).toBe('signed:PutObjectCommand');
      const [, cmd, opts] = signed.mock.calls[0] as [
        S3Client,
        PutObjectCommand,
        { expiresIn: number },
      ];
      expect(cmd).toBeInstanceOf(PutObjectCommand);
      expect(cmd.input).toMatchObject({
        Bucket: 'bucket',
        Key: 'videos/a/b/original',
        ContentType: 'video/mp4',
      });
      expect(opts.expiresIn).toBe(600);
    });

    it('createPresignedDownload assina um GetObject', async () => {
      const service = new StorageService(makeConfig());
      await service.createPresignedDownload('k');
      const [, cmd] = signed.mock.calls[0] as [S3Client, GetObjectCommand];
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input).toMatchObject({ Bucket: 'bucket', Key: 'k' });
    });
  });

  describe('head', () => {
    it('retorna o tamanho quando o objeto existe', async () => {
      send.mockResolvedValueOnce({ ContentLength: 42 } as never);
      const service = new StorageService(makeConfig());
      await expect(service.head('k')).resolves.toEqual({ size: 42 });
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    });

    it.each([
      Object.assign(new Error('nf'), { name: 'NotFound' }),
      Object.assign(new Error('nk'), { name: 'NoSuchKey' }),
      Object.assign(new Error('404'), { $metadata: { httpStatusCode: 404 } }),
    ])(
      'retorna null quando o storage responde não encontrado (%s)',
      async (err) => {
        send.mockRejectedValueOnce(err as never);
        const service = new StorageService(makeConfig());
        await expect(service.head('k')).resolves.toBeNull();
      },
    );

    it('propaga erros que não são "não encontrado" (credenciais, rede)', async () => {
      send.mockRejectedValueOnce(
        Object.assign(new Error('denied'), {
          name: 'AccessDenied',
          $metadata: { httpStatusCode: 403 },
        }) as never,
      );
      const service = new StorageService(makeConfig());
      await expect(service.head('k')).rejects.toThrow('denied');
    });
  });

  describe('leitura', () => {
    it('getRange envia o header Range inclusivo e devolve stream/tamanho/tipo', async () => {
      const body = { pipe: jest.fn() };
      send.mockResolvedValueOnce({
        Body: body,
        ContentLength: 1024,
        ContentType: 'video/mp4',
      } as never);
      const service = new StorageService(makeConfig());
      const out = await service.getRange('k', 0, 1023);
      const cmd = send.mock.calls[0][0] as GetObjectCommand;
      expect(cmd.input).toMatchObject({ Key: 'k', Range: 'bytes=0-1023' });
      expect(out).toEqual({
        stream: body,
        contentLength: 1024,
        contentType: 'video/mp4',
      });
    });

    it('getObject não envia Range e usa octet-stream como fallback de tipo', async () => {
      send.mockResolvedValueOnce({ Body: {}, ContentLength: 5 } as never);
      const service = new StorageService(makeConfig());
      const out = await service.getObject('k');
      const cmd = send.mock.calls[0][0] as GetObjectCommand;
      expect(cmd.input).not.toHaveProperty('Range');
      expect(out.contentType).toBe('application/octet-stream');
    });
  });

  describe('deleteObjects', () => {
    it('não chama o storage com lista vazia', async () => {
      const service = new StorageService(makeConfig());
      await service.deleteObjects([]);
      expect(send).not.toHaveBeenCalled();
    });

    it('envia um DeleteObjects silencioso com todas as chaves', async () => {
      const service = new StorageService(makeConfig());
      await service.deleteObjects(['a', 'b']);
      const cmd = send.mock.calls[0][0] as DeleteObjectsCommand;
      expect(cmd).toBeInstanceOf(DeleteObjectsCommand);
      expect(cmd.input).toEqual({
        Bucket: 'bucket',
        Delete: { Objects: [{ Key: 'a' }, { Key: 'b' }], Quiet: true },
      });
    });
  });

  describe('multipart', () => {
    it('needsMultipart compara com o threshold', () => {
      const service = new StorageService(makeConfig());
      expect(service.needsMultipart(100 * MiB)).toBe(false);
      expect(service.needsMultipart(100 * MiB + 1)).toBe(true);
    });

    it('createMultipartUpload cria o upload e assina uma URL por parte (ceil(size/partSize))', async () => {
      send.mockResolvedValueOnce({ UploadId: 'up-1' } as never);
      const service = new StorageService(makeConfig());
      const plan = await service.createMultipartUpload('k', 250 * MiB);
      expect(send.mock.calls[0][0]).toBeInstanceOf(
        CreateMultipartUploadCommand,
      );
      expect(plan.uploadId).toBe('up-1');
      expect(plan.partSize).toBe(100 * MiB);
      expect(plan.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
      const partCmds = signed.mock.calls.map(([, c]) => c as UploadPartCommand);
      expect(partCmds.every((c) => c instanceof UploadPartCommand)).toBe(true);
      expect(partCmds.map((c) => c.input.PartNumber)).toEqual([1, 2, 3]);
      expect(partCmds[0].input).toMatchObject({ Key: 'k', UploadId: 'up-1' });
    });

    it('completeMultipartUpload ordena as partes por partNumber', async () => {
      const service = new StorageService(makeConfig());
      await service.completeMultipartUpload('k', 'up-1', [
        { partNumber: 2, etag: 'b' },
        { partNumber: 1, etag: 'a' },
      ]);
      const cmd = send.mock.calls[0][0] as CompleteMultipartUploadCommand;
      expect(cmd).toBeInstanceOf(CompleteMultipartUploadCommand);
      expect(cmd.input.MultipartUpload?.Parts).toEqual([
        { PartNumber: 1, ETag: 'a' },
        { PartNumber: 2, ETag: 'b' },
      ]);
    });
  });
});

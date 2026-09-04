import { registerAs } from '@nestjs/config';

// Object storage (MinIO em dev, S3 em produção). Ver TD-03.1.
export default registerAs('storage', () => ({
  endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
  region: process.env.S3_REGION || 'us-east-1',
  accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
  bucket: process.env.S3_BUCKET || 'streamtube-videos',
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
  presignExpiresSec: parseInt(process.env.S3_PRESIGN_EXPIRES || '3600', 10),
  // Acima do threshold, o upload usa multipart (single PUT do S3 é limitado a 5GB;
  // o brief pede até 10GB). Parte mínima de 5MB por regra do S3 (exceto a última).
  multipartThreshold: parseInt(
    process.env.S3_MULTIPART_THRESHOLD || String(100 * 1024 * 1024),
    10,
  ),
  multipartPartSize: parseInt(
    process.env.S3_MULTIPART_PART_SIZE || String(100 * 1024 * 1024),
    10,
  ),
}));

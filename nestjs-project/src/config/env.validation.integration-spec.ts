import { envValidationSchema } from './env.validation';

type Env = Record<string, unknown>;
type ValidationResult = { value: Env; error?: { message: string } };

const requiredEnv = {
  DB_USERNAME: 'user',
  DB_PASSWORD: 'pass',
  DB_NAME: 'db',
  JWT_SECRET: 'secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
};

const validate = (env: Record<string, string>): ValidationResult =>
  envValidationSchema.validate(
    { ...requiredEnv, ...env },
    { allowUnknown: true, abortEarly: false },
  ) as ValidationResult;

describe('envValidationSchema — SWAGGER_ENABLED', () => {
  it('should reject SWAGGER_ENABLED with an invalid value', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'invalid' });
    expect(error).toBeDefined();
    expect(error!.message).toContain('SWAGGER_ENABLED');
  });

  it('should accept SWAGGER_ENABLED=true', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'true' });
    expect(error).toBeUndefined();
  });

  it('should accept SWAGGER_ENABLED=false', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'false' });
    expect(error).toBeUndefined();
  });

  it('should apply default false when SWAGGER_ENABLED is not set', () => {
    const { value, error } = validate({});
    expect(error).toBeUndefined();
    expect(value.SWAGGER_ENABLED).toBe('false');
  });
});

describe('envValidationSchema — Fase 03 (storage e fila)', () => {
  it('should require the S3 credentials', () => {
    const { error } = envValidationSchema.validate(
      { ...requiredEnv, S3_ACCESS_KEY: undefined, S3_SECRET_KEY: undefined },
      { allowUnknown: true, abortEarly: false },
    ) as ValidationResult;
    expect(error).toBeDefined();
    expect(error!.message).toContain('S3_ACCESS_KEY');
    expect(error!.message).toContain('S3_SECRET_KEY');
  });

  it('should apply storage/queue defaults (public endpoint, multipart sizes, redis)', () => {
    const { value, error } = validate({});
    expect(error).toBeUndefined();
    expect(value.S3_ENDPOINT).toBe('http://minio:9000');
    expect(value.S3_PUBLIC_ENDPOINT).toBe('http://localhost:9000');
    expect(value.S3_MULTIPART_THRESHOLD).toBe(100 * 1024 * 1024);
    expect(value.S3_MULTIPART_PART_SIZE).toBe(100 * 1024 * 1024);
    expect(value.REDIS_HOST).toBe('redis');
  });

  it('should reject multipart part size below the S3 minimum (5MB) or invalid endpoints', () => {
    const { error } = validate({
      S3_MULTIPART_PART_SIZE: String(1024 * 1024),
      S3_PUBLIC_ENDPOINT: 'not-a-url',
    });
    expect(error).toBeDefined();
    expect(error!.message).toContain('S3_MULTIPART_PART_SIZE');
    expect(error!.message).toContain('S3_PUBLIC_ENDPOINT');
  });
});

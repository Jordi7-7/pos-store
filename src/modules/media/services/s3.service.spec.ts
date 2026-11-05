import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { S3Service } from './s3.service';

describe('S3Service (aislamiento por tenant y validación de subidas)', () => {
  const values: Record<string, string> = {
    AWS_S3_BUCKET_NAME: 'pos-bucket',
    AWS_S3_PUBLIC_URL: 'https://cdn.example.com',
    AWS_ACCESS_KEY_ID: 'AKIATEST',
    AWS_SECRET_ACCESS_KEY: 'secret',
  };
  const configService = { get: (key: string) => values[key] } as unknown as ConfigService;
  const service = new S3Service(configService);

  const prefixA = service.tenantKeyPrefix('tenant-a');
  const prefixB = service.tenantKeyPrefix('tenant-b');

  it('cada tenant tiene un prefijo distinto y estable', () => {
    expect(prefixA).toMatch(/^[0-9a-f]{16}\/$/);
    expect(prefixA).not.toBe(prefixB);
    expect(service.tenantKeyPrefix('tenant-a')).toBe(prefixA);
  });

  it('reconoce claves y URLs del propio tenant', () => {
    expect(service.belongsToTenant('tenant-a', `${prefixA}products/x.png`)).toBe(true);
    expect(service.belongsToTenant('tenant-a', `https://cdn.example.com/${prefixA}products/x.png`)).toBe(true);
  });

  it('rechaza claves de otro tenant y intentos de path traversal', () => {
    expect(service.belongsToTenant('tenant-a', `${prefixB}products/x.png`)).toBe(false);
    expect(service.belongsToTenant('tenant-a', `${prefixA}../${prefixB}products/x.png`)).toBe(false);
    expect(service.belongsToTenant('tenant-a', 'cualquier/cosa.png')).toBe(false);
  });

  it('assertBelongsToTenant lanza 403 MEDIA_NOT_OWNED para objetos ajenos', () => {
    let error: unknown;
    try {
      service.assertBelongsToTenant('tenant-a', `${prefixB}products/x.png`);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(ErrorCode.MediaNotOwned);
    expect((error as AppException).getStatus()).toBe(403);
  });

  it('el presigned URL rechaza tipos que no son imagen', async () => {
    await expect(service.getUploadPresignedUrl('tenant-a', 'a.html', 'text/html')).rejects.toMatchObject({
      code: ErrorCode.UnsupportedMediaType,
    });
  });

  it('el presigned URL genera una clave dentro del prefijo del tenant y con nombre saneado', async () => {
    const { fileUrl } = await service.getUploadPresignedUrl('tenant-a', '../../Mi Foto (1).PNG', 'image/png');

    expect(fileUrl.startsWith(`https://cdn.example.com/${prefixA}products/`)).toBe(true);
    expect(fileUrl).not.toContain('..');
    expect(fileUrl).toMatch(/mi-foto-1-\.png$|mi-foto-1\.png$|mi-foto-1-.png$/);
  });
});

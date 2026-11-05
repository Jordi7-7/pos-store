import * as http from 'http';
import { AddressInfo } from 'net';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { fetchRemoteImage, isBlockedAddress } from './safe-image-fetcher';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254', // metadatos cloud
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.5',
    'no-es-una-ip',
  ])('bloquea %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111'])('permite %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('fetchRemoteImage', () => {
  let server: http.Server;
  let baseUrl: string;
  let handler: http.RequestListener;

  beforeAll(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const allowLocal = { isAddressAllowed: () => true };
  const expectCode = async (promise: Promise<unknown>, code: ErrorCode): Promise<void> => {
    const error: unknown = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
  };

  it('bloquea destinos privados por defecto (loopback)', async () => {
    handler = (_req, res) => res.end('x');
    await expectCode(fetchRemoteImage(`${baseUrl}/a.png`), ErrorCode.InvalidMediaUrl);
  });

  it('rechaza protocolos distintos de http/https y URLs con credenciales', async () => {
    await expectCode(fetchRemoteImage('file:///etc/passwd'), ErrorCode.InvalidMediaUrl);
    await expectCode(fetchRemoteImage('ftp://example.com/a.png'), ErrorCode.InvalidMediaUrl);
    await expectCode(fetchRemoteImage('http://user:pass@example.com/a.png'), ErrorCode.InvalidMediaUrl);
    await expectCode(fetchRemoteImage('no es una url'), ErrorCode.InvalidMediaUrl);
  });

  it('descarga una imagen válida', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(Buffer.from([1, 2, 3]));
    };

    const image = await fetchRemoteImage(`${baseUrl}/a.png`, allowLocal);

    expect(image.contentType).toBe('image/png');
    expect([...image.buffer]).toEqual([1, 2, 3]);
  });

  it('rechaza contenido que no es imagen', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html></html>');
    };
    await expectCode(fetchRemoteImage(`${baseUrl}/a`, allowLocal), ErrorCode.UnsupportedMediaType);
  });

  it('no sigue redirecciones', async () => {
    handler = (_req, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
      res.end();
    };
    await expectCode(fetchRemoteImage(`${baseUrl}/a`, allowLocal), ErrorCode.InvalidMediaUrl);
  });

  it('rechaza imágenes que superan el tamaño máximo', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      res.end(Buffer.alloc(2048));
    };
    await expectCode(fetchRemoteImage(`${baseUrl}/big.jpg`, { ...allowLocal, maxBytes: 1024 }), ErrorCode.PayloadTooLarge);
  });
});

describe('fetchRemoteImage: IPs literales (sin DNS)', () => {
  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:3000/health',
    'http://10.0.0.5/a.png',
    'http://[::1]/a.png',
    'http://2130706433/a.png', // 127.0.0.1 en decimal: la URL se normaliza
    'http://0x7f.1/a.png', // 127.0.0.1 en hexadecimal
  ])('bloquea %s sin llegar a conectar', async (url) => {
    const error: unknown = await fetchRemoteImage(url).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(ErrorCode.InvalidMediaUrl);
  });
});

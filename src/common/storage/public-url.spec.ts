import { publicUrlTransformer, toPublicUrl, toStorageKey } from './public-url';

describe('dirección pública de una imagen', () => {
  const previous = process.env.AWS_S3_PUBLIC_URL;
  afterEach(() => {
    if (previous === undefined) delete process.env.AWS_S3_PUBLIC_URL;
    else process.env.AWS_S3_PUBLIC_URL = previous;
  });

  it('la clave guardada se publica detrás del dominio del CDN, con o sin barra final', () => {
    process.env.AWS_S3_PUBLIC_URL = 'https://cdn.example.com/';
    expect(toPublicUrl('tienda-1/foto.jpg')).toBe('https://cdn.example.com/tienda-1/foto.jpg');
  });

  it('una dirección que ya es completa no se vuelve a prefijar', () => {
    process.env.AWS_S3_PUBLIC_URL = 'https://cdn.example.com';
    expect(toPublicUrl('https://otro.example.com/foto.jpg')).toBe('https://otro.example.com/foto.jpg');
    expect(toPublicUrl(toPublicUrl('a/b.jpg'))).toBe('https://cdn.example.com/a/b.jpg');
  });

  it('sin dominio configurado se devuelve la clave, no un «undefined/...»', () => {
    delete process.env.AWS_S3_PUBLIC_URL;
    expect(toPublicUrl('a/b.jpg')).toBe('a/b.jpg');
  });

  it('al guardar se vuelve a la clave: leer y volver a guardar una imagen no acumula el dominio', () => {
    process.env.AWS_S3_PUBLIC_URL = 'https://cdn.example.com';
    const loaded = publicUrlTransformer.from('a/b.jpg') as string;
    expect(publicUrlTransformer.to(loaded)).toBe('a/b.jpg');
    expect(toStorageKey('a/b.jpg')).toBe('a/b.jpg');
  });

  it('un valor nulo pasa sin tocarse', () => {
    expect(publicUrlTransformer.from(null)).toBeNull();
    expect(publicUrlTransformer.to(undefined)).toBeUndefined();
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterImageDto, UploadImageByUrlDto } from './media.dto';

describe('DTOs de media', () => {
  const longUrl = `https://images.example.com/photo.jpg?${'a=1&'.repeat(700)}`; // ~2800 caracteres

  it('upload-by-url acepta URLs largas de buscadores de imágenes', async () => {
    expect(longUrl.length).toBeGreaterThan(2048);
    expect(await validate(plainToInstance(UploadImageByUrlDto, { url: longUrl }))).toHaveLength(0);
  });

  it('register acepta URLs firmadas largas', async () => {
    expect(await validate(plainToInstance(RegisterImageDto, { url: longUrl, description: 'x' }))).toHaveLength(0);
  });

  it('rechaza una url vacía con el mensaje esperado', async () => {
    const errors = await validate(plainToInstance(UploadImageByUrlDto, { url: '' }));
    expect(errors[0].constraints).toMatchObject({ isNotEmpty: 'url is required' });
  });
});

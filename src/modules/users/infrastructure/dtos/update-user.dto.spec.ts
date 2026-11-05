import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { UpdateUserDto } from './update-user.dto';

describe('ValidationPipe global + UpdateUserDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const metadata: ArgumentMetadata = { type: 'body', metatype: UpdateUserDto };

  it('elimina propiedades no declaradas (whitelist)', async () => {
    const result = (await pipe.transform(
      { name: 'Ana', isOwner: true },
      metadata,
    )) as Record<string, unknown>;

    expect(result.name).toBe('Ana');
    expect(result).not.toHaveProperty('isOwner');
  });

  it('rechaza customPermissions que no sea un arreglo de textos', async () => {
    await expect(
      pipe.transform({ customPermissions: 'todo' }, metadata),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ customPermissions: [1, 2] }, metadata),
    ).rejects.toThrow();
  });

  it('rechaza un email inválido', async () => {
    await expect(
      pipe.transform({ email: 'no-es-email' }, metadata),
    ).rejects.toThrow();
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImportVariantProductsDto } from './import-variant-products.dto';

describe('importación por variantes: atributos por fila', () => {
  const errorsFor = (attributes: number) =>
    validate(
      plainToInstance(ImportVariantProductsDto, {
        rows: [{ row: 2, name: 'Mochila', baseSku: 'MC', sku: 'MC-001', salePrice: 10, attributes: Array.from({ length: attributes }, (_, i) => ({ name: `Pieza ${i + 1}`, value: 'Negro' })) }],
      }),
    );

  it('admite hasta cinco (cuatro piezas de color y el cierre)', async () => {
    await expect(errorsFor(5)).resolves.toEqual([]);
  });

  it('rechaza seis', async () => {
    await expect(errorsFor(6)).resolves.not.toEqual([]);
  });
});

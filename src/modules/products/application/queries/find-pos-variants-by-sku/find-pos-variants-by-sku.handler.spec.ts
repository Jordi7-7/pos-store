import { QueryBus } from '@nestjs/cqrs';
import { GetPosVariantBySkuQuery } from '../get-pos-variant-by-sku/get-pos-variant-by-sku.query';
import { GetPosVariantsByBaseSkuQuery } from '../get-pos-variants-by-base-sku/get-pos-variants-by-base-sku.query';
import { FindPosVariantsBySkuHandler } from './find-pos-variants-by-sku.handler';
import { FindPosVariantsBySkuQuery } from './find-pos-variants-by-sku.query';

describe('FindPosVariantsBySkuHandler', () => {
  const execute = jest.fn();
  const handler = new FindPosVariantsBySkuHandler({ execute } as unknown as QueryBus);
  const query = new FindPosVariantsBySkuQuery('t1', 'ABC', 'b1');

  beforeEach(() => execute.mockReset());

  it('devuelve las variantes cuyo SKU o código de barras coincide, sin buscar por SKU base', async () => {
    const variants = [{ id: 'v1' }];
    execute.mockResolvedValueOnce(variants);

    await expect(handler.execute(query)).resolves.toBe(variants);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toBeInstanceOf(GetPosVariantBySkuQuery);
  });

  it('sin coincidencia directa busca el SKU base de un producto variable', async () => {
    const product = { productId: 'p1', variants: [] };
    execute.mockResolvedValueOnce([]).mockResolvedValueOnce(product);

    await expect(handler.execute(query)).resolves.toBe(product);
    expect(execute.mock.calls[1][0]).toBeInstanceOf(GetPosVariantsByBaseSkuQuery);
  });

  it('si tampoco existe como SKU base devuelve una lista vacía', async () => {
    execute.mockResolvedValueOnce([]).mockResolvedValueOnce(null);

    await expect(handler.execute(query)).resolves.toEqual([]);
  });
});

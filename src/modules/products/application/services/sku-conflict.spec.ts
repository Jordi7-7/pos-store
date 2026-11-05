import { ErrorCode } from '../../../../common/errors/error-codes';
import { PRODUCT_VARIANT_SKU_INDEX } from '../../domain/entities/product-variant.entity';
import { translatingSkuConflict } from './sku-conflict';

/** Error como el que devuelve el driver de Postgres: un Error con código y restricción. */
const pgError = (code: string, constraint: string): Error => Object.assign(new Error('violación de unicidad'), { code, constraint });

describe('translatingSkuConflict', () => {
  it('devuelve el resultado cuando no hay conflicto', async () => {
    await expect(translatingSkuConflict(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('traduce la violación del índice único de SKU a SKU_TAKEN (409)', async () => {
    const failure = translatingSkuConflict(() => Promise.reject(pgError('23505', PRODUCT_VARIANT_SKU_INDEX)));

    await expect(failure).rejects.toMatchObject({ code: ErrorCode.SkuTaken });
    await expect(failure).rejects.toMatchObject({ status: 409 });
  });

  it('no toca otras violaciones de unicidad ni otros errores', async () => {
    const other = pgError('23505', 'otro_indice');
    await expect(translatingSkuConflict(() => Promise.reject(other))).rejects.toBe(other);

    const boom = new Error('boom');
    await expect(translatingSkuConflict(() => Promise.reject(boom))).rejects.toBe(boom);
  });
});

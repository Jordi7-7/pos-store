import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { FindPosVariantsBySkuQuery } from './find-pos-variants-by-sku.query';
import { GetPosVariantBySkuQuery } from '../get-pos-variant-by-sku/get-pos-variant-by-sku.query';
import { GetPosVariantsByBaseSkuQuery } from '../get-pos-variants-by-base-sku/get-pos-variants-by-base-sku.query';
import { PosVariableProductResponse } from '../get-pos-variants-by-base-sku/get-pos-variants-by-base-sku.handler';
import { PosVariantResponse } from '../../read-models/pos-variant-response';

export type PosSkuSearchResult = PosVariantResponse[] | PosVariableProductResponse;

/**
 * Búsqueda del POS por texto escaneado o tecleado: primero SKU o código de barras de una
 * variante; si no hay coincidencia, el SKU base de un producto variable (devuelve el producto
 * con todas sus variantes para elegir una). Sin resultados devuelve una lista vacía.
 */
@QueryHandler(FindPosVariantsBySkuQuery)
export class FindPosVariantsBySkuHandler implements IQueryHandler<FindPosVariantsBySkuQuery> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(query: FindPosVariantsBySkuQuery): Promise<PosSkuSearchResult> {
    const { tenantId, sku, branchId } = query;

    const variants = await this.queryBus.execute<GetPosVariantBySkuQuery, PosVariantResponse[]>(
      new GetPosVariantBySkuQuery(tenantId, sku, branchId),
    );
    if (variants.length > 0) {
      return variants;
    }

    const variableProduct = await this.queryBus.execute<GetPosVariantsByBaseSkuQuery, PosVariableProductResponse | null>(
      new GetPosVariantsByBaseSkuQuery(tenantId, sku, branchId),
    );
    return variableProduct ?? [];
  }
}

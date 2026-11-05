import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { GetValuedInventoryQuery } from './get-valued-inventory.query';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { valueStock } from '../../../domain/inventory-valuation';
import { Money } from '../../../../../common/domain/money';
import { addQuantities } from '../../../../../common/domain/quantity';
import { SqlParams } from '../../../../../common/utils/sql-params';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';

/** Variante con existencias tal como la devuelve Postgres: numeric llega como texto. */
interface StockedVariantRow {
  id: string;
  sku: string;
  quantity: string;
  layersQuantity: string;
  layersValue: string;
  currentCost: string;
}

interface ValuedVariant {
  id: string;
  sku: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
}

@QueryHandler(GetValuedInventoryQuery)
export class GetValuedInventoryHandler implements IQueryHandler<GetValuedInventoryQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Existencias valuadas con lo que realmente queda en los lotes (costo FIFO), la misma base que el
   * costo de ventas. Los totales cubren todas las variantes con existencias; la página solo recorta la lista.
   */
  async execute(query: GetValuedInventoryQuery) {
    const { tenantId, page, limit, branchId, userId, isOwner } = query;

    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      isOwner,
      branchId,
      actionDescription: 'consultar el reporte de existencias valuadas',
    });

    const valued = (await this.loadStockedVariants(tenantId, branchId)).map(toValuedVariant);

    const totalQuantity = valued.reduce((sum, variant) => addQuantities(sum, variant.quantity), 0);
    const totalValue = Money.sum(valued.map((variant) => Money.of(variant.totalValue))).toNumber();

    const pageItems = page && limit ? valued.slice((page - 1) * limit, page * limit) : valued;
    const names = await this.loadNames(pageItems.map((variant) => variant.id));

    return {
      data: pageItems.map((variant) => ({
        sku: variant.sku,
        name: names.get(variant.id) ?? '',
        quantity: variant.quantity,
        // Costo medio por unidad de lo que hay en existencia
        purchasePrice: variant.unitCost,
        totalValue: variant.totalValue,
      })),
      meta: {
        total: valued.length,
        page: page || 1,
        limit: limit || valued.length,
        totalPages: limit ? Math.ceil(valued.length / limit) : 1,
        totalQuantity,
        totalValue,
      },
    };
  }

  /** Una fila por variante con existencias distintas de cero, con sus unidades y valor en lotes. */
  private loadStockedVariants(tenantId: string, branchId: string | undefined): Promise<StockedVariantRow[]> {
    const params = new SqlParams();
    const tenant = params.add(tenantId);
    const branch = branchId ? params.add(branchId) : null;

    return this.entityManager.query<StockedVariantRow[]>(
      `
      SELECT v.id,
             v.sku,
             stock.quantity AS "quantity",
             COALESCE(layers.quantity, 0) AS "layersQuantity",
             COALESCE(layers.value, 0) AS "layersValue",
             v.purchase_price AS "currentCost"
      FROM product_variants v
      INNER JOIN (
        SELECT variant_id, SUM(quantity) AS quantity
        FROM product_stocks
        ${branch ? `WHERE branch_id = ${branch}` : ''}
        GROUP BY variant_id
      ) stock ON stock.variant_id = v.id
      LEFT JOIN (
        SELECT variant_id,
               SUM(remaining_quantity) AS quantity,
               SUM(remaining_quantity * unit_cost) AS value
        FROM product_batches
        WHERE tenant_id = ${tenant} AND remaining_quantity > 0 ${branch ? `AND branch_id = ${branch}` : ''}
        GROUP BY variant_id
      ) layers ON layers.variant_id = v.id
      WHERE v.tenant_id = ${tenant}
        AND v.deleted_at IS NULL
        AND stock.quantity <> 0
      ORDER BY v.sku ASC
      `,
      params.values,
    );
  }

  /** Nombre visible de cada variante: producto y, si tiene, sus atributos (p. ej. "Camisa (Rojo / M)"). */
  private async loadNames(variantIds: string[]): Promise<Map<string, string>> {
    if (variantIds.length === 0) return new Map();
    const variants = await this.entityManager.getRepository(ProductVariant).find({
      where: { id: In(variantIds) },
      relations: { product: true, attributeValues: true },
    });
    return new Map(
      variants.map((variant) => {
        const attributes = (variant.attributeValues ?? []).map((attribute) => attribute.value).join(' / ');
        const productName = variant.product?.name ?? '';
        return [variant.id, attributes ? `${productName} (${attributes})` : productName];
      }),
    );
  }
}

function toValuedVariant(row: StockedVariantRow): ValuedVariant {
  const quantity = Number(row.quantity);
  const valuation = valueStock({
    quantity,
    layersQuantity: Number(row.layersQuantity),
    layersValue: Number(row.layersValue),
    currentCost: Number(row.currentCost),
  });
  return { id: row.id, sku: row.sku, quantity, unitCost: valuation.unitCost, totalValue: valuation.totalValue };
}

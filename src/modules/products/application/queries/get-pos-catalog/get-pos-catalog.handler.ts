import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { GetPosCatalogQuery } from './get-pos-catalog.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { formatPosCatalogCursor, parseCatalogPageSize, parsePosCatalogCursor } from '../../../domain/services/pos-catalog-cursor';
import { PosCatalogItem, PosCatalogPage } from '../../read-models/pos-catalog';
import { SqlParams } from '../../../../../common/utils/sql-params';

interface ChangedRow {
  id: string;
  changed_at: string;
}

/**
 * Catálogo del POS por lotes y por cambios, para que el aparato pueda vender sin conexión. Se ordena por la
 * última modificación de la variante O de su producto (renombrar un producto cambia sus variantes) y por id,
 * y se devuelven también las variantes borradas para que el aparato las quite. Es de toda la tienda: el
 * stock no viaja, porque sin conexión no se puede confiar en él y las ventas no se rechazan por stock.
 */
@QueryHandler(GetPosCatalogQuery)
export class GetPosCatalogHandler implements IQueryHandler<GetPosCatalogQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPosCatalogQuery): Promise<PosCatalogPage> {
    const limit = parseCatalogPageSize(query.limit);
    const after = parsePosCatalogCursor(query.after);

    const params = new SqlParams();
    const tenant = params.add(query.tenantId);
    const cursorFilter = after
      ? `AND (GREATEST(v.updated_at, p.updated_at), v.id) > (${params.add(after.changedAt)}::timestamptz, ${params.add(after.id)}::uuid)`
      : '';
    const rows = await this.entityManager.query<ChangedRow[]>(
      `SELECT v.id AS id,
              to_char(GREATEST(v.updated_at, p.updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS changed_at
         FROM product_variants v
         INNER JOIN products p ON p.id = v.product_id
        WHERE v.tenant_id = ${tenant} ${cursorFilter}
        ORDER BY GREATEST(v.updated_at, p.updated_at) ASC, v.id ASC
        LIMIT ${params.add(limit)}`,
      params.values,
    );

    const variants = await this.loadVariants(rows.map((row) => row.id), query.tenantId);
    const items = rows.map((row) => variants.get(row.id)).filter((item): item is PosCatalogItem => item !== undefined);

    const last = rows[rows.length - 1];
    return {
      items,
      cursor: last ? formatPosCatalogCursor({ changedAt: last.changed_at, id: last.id }) : (query.after && after ? formatPosCatalogCursor(after) : null),
      hasMore: rows.length === limit,
      serverTime: new Date().toISOString(),
    };
  }

  private async loadVariants(ids: string[], tenantId: string): Promise<Map<string, PosCatalogItem>> {
    if (ids.length === 0) return new Map();
    const variants = await this.entityManager.getRepository(ProductVariant).find({
      where: { id: In(ids), tenantId },
      withDeleted: true,
      relations: { product: true, attributeValues: { attribute: true } },
    });
    return new Map(
      variants.map((variant): [string, PosCatalogItem] => [
        variant.id,
        {
          id: variant.id,
          sku: variant.sku,
          barcode: variant.barcode,
          productId: variant.productId,
          productName: variant.product.name,
          productType: variant.product.type,
          baseSku: variant.product.baseSku,
          salePrice: Number(variant.salePrice),
          wholesalePrice: variant.wholesalePrice !== null && variant.wholesalePrice !== undefined ? Number(variant.wholesalePrice) : null,
          attributes: (variant.attributeValues ?? []).map((value) => ({
            attributeId: value.attributeId,
            attributeName: value.attribute?.name ?? '',
            valueId: value.id,
            valueName: value.value,
          })),
          deleted: variant.deletedAt !== null || variant.product.deletedAt !== null,
        },
      ]),
    );
  }
}

import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPosStockQuery } from './get-pos-stock.query';
import { formatPosCatalogCursor, parseCatalogPageSize, parsePosCatalogCursor } from '../../../domain/services/pos-catalog-cursor';
import { PosStockPage } from '../../read-models/pos-stock';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';
import { SqlParams } from '../../../../../common/utils/sql-params';

interface StockRow {
  variant_id: string;
  quantity: number;
  changed_at: string;
}

/**
 * Existencias de UNA sucursal por lotes y por cambios, para que el POS las muestre sin conexión. Cada sucursal tiene
 * su propio stock por variante: solo se baja el de la sucursal pedida, y solo si el usuario tiene acceso a ella.
 * Usa el mismo cursor que el catálogo (fecha de cambio con microsegundos + id de la variante).
 */
@QueryHandler(GetPosStockQuery)
export class GetPosStockHandler implements IQueryHandler<GetPosStockQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetPosStockQuery): Promise<PosStockPage> {
    const { tenantId, branchId, userId, isOwner } = query;
    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      isOwner,
      branchId,
      actionDescription: 'consultar las existencias de la sucursal',
    });

    const limit = parseCatalogPageSize(query.limit);
    const after = parsePosCatalogCursor(query.after);

    const params = new SqlParams();
    const tenant = params.add(tenantId);
    const branch = params.add(branchId);
    const cursorFilter = after ? `AND (s.updated_at, s.variant_id) > (${params.add(after.changedAt)}::timestamptz, ${params.add(after.id)}::uuid)` : '';
    const rows = await this.entityManager.query<StockRow[]>(
      `SELECT s.variant_id AS variant_id,
              s.quantity::float8 AS quantity,
              to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS changed_at
         FROM product_stocks s
         INNER JOIN product_variants v ON v.id = s.variant_id
         INNER JOIN branches b ON b.id = s.branch_id
        WHERE v.tenant_id = ${tenant} AND b.tenant_id = ${tenant} AND s.branch_id = ${branch}
          AND s.deleted_at IS NULL ${cursorFilter}
        ORDER BY s.updated_at ASC, s.variant_id ASC
        LIMIT ${params.add(limit)}`,
      params.values,
    );

    const last = rows[rows.length - 1];
    return {
      items: rows.map((row) => ({ variantId: row.variant_id, quantity: Number(row.quantity) })),
      cursor: last ? formatPosCatalogCursor({ changedAt: last.changed_at, id: last.variant_id }) : after ? formatPosCatalogCursor(after) : null,
      hasMore: rows.length === limit,
      serverTime: new Date().toISOString(),
    };
  }
}

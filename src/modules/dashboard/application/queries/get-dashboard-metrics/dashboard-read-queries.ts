import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { SqlParams } from '../../../../../common/utils/sql-params';
import { SaleStatus } from '../../../../../common/enums/sale-status.enum';
import { DateRange } from './dashboard-periods';
import {
  LowStockRow,
  PaymentMethodRow,
  SoldYesterdayRow,
  TodayRefundsRow,
  TodaySalesRow,
  TopProductRow,
  WeekDayRow,
} from './dashboard-summary';

export interface DashboardScope {
  tenantId: string;
  /** Sin sucursal, el panel agrega todas las del tenant. */
  branchId?: string;
}

const TOP_PRODUCTS_LIMIT = 5;
const LOW_STOCK_THRESHOLD = 5;
const LIST_LIMIT = 50;

/**
 * Consultas de lectura del panel. Cada método es un SQL independiente; todo valor (tenant,
 * sucursal, fechas, zona horaria) se enlaza como parámetro.
 */
@Injectable()
export class DashboardReadQueries {
  constructor(private readonly entityManager: EntityManager) {}

  /** Marcadores compartidos por una consulta: tenant, sucursal opcional y la ventana de estado. */
  private scoped(scope: DashboardScope) {
    const params = new SqlParams();
    const tenant = params.add(scope.tenantId);
    const branch = scope.branchId ? params.add(scope.branchId) : null;
    const branchFilter = (alias: string): string => (branch ? `AND ${alias}.branch_id = ${branch}` : '');
    return { params, tenant, branch, branchFilter };
  }

  /** Ventas brutas del rango y unidades vendidas (no cuenta las ventas devueltas por completo). */
  async salesInRange(scope: DashboardScope, range: DateRange): Promise<TodaySalesRow | undefined> {
    const { params, tenant, branchFilter } = this.scoped(scope);
    const refunded = params.add(SaleStatus.REFUNDED);
    const from = params.add(range.from);
    const to = params.add(range.to);

    const rows = await this.entityManager.query<TodaySalesRow[]>(
      `
      SELECT
        COALESCE(SUM(s.total), 0) AS "totalSales",
        COALESCE((
          SELECT SUM(si.quantity)
          FROM sale_items si
          INNER JOIN sales s2 ON s2.id = si.sale_id
          WHERE s2.tenant_id = ${tenant}
            ${branchFilter('s2')}
            AND s2.status != ${refunded}
            AND s2.created_at BETWEEN ${from} AND ${to}
        ), 0) AS "itemsCount"
      FROM sales s
      WHERE s.tenant_id = ${tenant}
        ${branchFilter('s')}
        AND s.status != ${refunded}
        AND s.created_at BETWEEN ${from} AND ${to}
      `,
      params.values,
    );
    return rows[0];
  }

  /** Total devuelto, unidades devueltas y número de devoluciones del rango. */
  async refundsInRange(scope: DashboardScope, range: DateRange): Promise<TodayRefundsRow | undefined> {
    const { params, tenant, branchFilter } = this.scoped(scope);
    const from = params.add(range.from);
    const to = params.add(range.to);

    const rows = await this.entityManager.query<TodayRefundsRow[]>(
      `
      SELECT
        COALESCE(SUM(r.total_refunded), 0) AS "totalRefunded",
        COALESCE((
          SELECT SUM(ri.quantity)
          FROM refund_items ri
          INNER JOIN refunds r2 ON r2.id = ri.refund_id
          WHERE r2.tenant_id = ${tenant}
            ${branchFilter('r2')}
            AND r2.created_at BETWEEN ${from} AND ${to}
        ), 0) AS "refundedItemsCount",
        COUNT(r.id) AS "refundsCount"
      FROM refunds r
      WHERE r.tenant_id = ${tenant}
        ${branchFilter('r')}
        AND r.created_at BETWEEN ${from} AND ${to}
      `,
      params.values,
    );
    return rows[0];
  }

  /** Importe cobrado por método de pago en el rango. */
  paymentsInRange(scope: DashboardScope, range: DateRange): Promise<PaymentMethodRow[]> {
    const { params, tenant, branchFilter } = this.scoped(scope);
    const refunded = params.add(SaleStatus.REFUNDED);
    const from = params.add(range.from);
    const to = params.add(range.to);

    return this.entityManager.query<PaymentMethodRow[]>(
      `
      SELECT
        sp.payment_method AS "method",
        COALESCE(SUM(sp.amount), 0) AS "amount"
      FROM sale_payments sp
      INNER JOIN sales s ON s.id = sp.sale_id
      WHERE s.tenant_id = ${tenant}
        ${branchFilter('s')}
        AND s.status != ${refunded}
        AND s.created_at BETWEEN ${from} AND ${to}
      GROUP BY sp.payment_method
      `,
      params.values,
    );
  }

  /** Variantes más vendidas desde la fecha indicada, con su primera imagen. */
  topProducts(scope: DashboardScope, since: Date): Promise<TopProductRow[]> {
    const { params, tenant, branchFilter } = this.scoped(scope);
    const refunded = params.add(SaleStatus.REFUNDED);
    const from = params.add(since);

    return this.entityManager.query<TopProductRow[]>(
      `
      WITH top_variants AS (
        SELECT
          si.variant_id,
          SUM(si.quantity) AS "quantitySold"
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.tenant_id = ${tenant}
          ${branchFilter('s')}
          AND s.status != ${refunded}
          AND s.created_at >= ${from}
        GROUP BY si.variant_id
        ORDER BY "quantitySold" DESC
        LIMIT ${TOP_PRODUCTS_LIMIT}
      )
      SELECT
        tv.variant_id AS "variantId",
        COALESCE(p.name, '') AS "productName",
        pv.sku AS "sku",
        pi.url AS "imageUrl",
        tv."quantitySold"
      FROM top_variants tv
      INNER JOIN product_variants pv ON pv.id = tv.variant_id
      INNER JOIN products p ON p.id = pv.product_id
      LEFT JOIN LATERAL (
        SELECT pim.url
        FROM product_image_mappings pimap
        INNER JOIN product_images pim ON pim.id = pimap.product_image_id
        WHERE pimap.product_id = p.id
        LIMIT 1
      ) pi ON true
      ORDER BY tv."quantitySold" DESC
      `,
      params.values,
    );
  }

  /** Variantes con poco stock que tuvieron actividad (alta o lote) desde la fecha indicada. */
  lowStockProducts(scope: DashboardScope, activeSince: Date): Promise<LowStockRow[]> {
    const { params, tenant, branch } = this.scoped(scope);
    const since = params.add(activeSince);

    return this.entityManager.query<LowStockRow[]>(
      `
      SELECT
        pv.id AS "variantId",
        p.name AS "productName",
        pv.sku AS "sku",
        COALESCE(SUM(ps.quantity), 0) AS "stock"
      FROM product_variants pv
      INNER JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
      LEFT JOIN product_stocks ps ON ps.variant_id = pv.id ${branch ? `AND ps.branch_id = ${branch}` : ''}
      WHERE pv.tenant_id = ${tenant}
        AND pv.deleted_at IS NULL
        AND (
          pv.created_at >= ${since}
          OR EXISTS (
            SELECT 1 FROM product_batches pb
            WHERE pb.variant_id = pv.id
              AND pb.created_at >= ${since}
              ${branch ? `AND pb.branch_id = ${branch}` : ''}
          )
        )
      GROUP BY pv.id, p.name, pv.sku
      HAVING COALESCE(SUM(ps.quantity), 0) <= ${LOW_STOCK_THRESHOLD}
      ORDER BY "stock" ASC
      LIMIT ${LIST_LIMIT}
      `,
      params.values,
    );
  }

  /** Variantes vendidas en el rango con su stock actual. */
  soldInRangeWithStock(scope: DashboardScope, range: DateRange): Promise<SoldYesterdayRow[]> {
    const { params, tenant, branch, branchFilter } = this.scoped(scope);
    const refunded = params.add(SaleStatus.REFUNDED);
    const from = params.add(range.from);
    const to = params.add(range.to);

    return this.entityManager.query<SoldYesterdayRow[]>(
      `
      WITH sold AS (
        SELECT DISTINCT si.variant_id
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.tenant_id = ${tenant}
          ${branchFilter('s')}
          AND s.status != ${refunded}
          AND s.created_at BETWEEN ${from} AND ${to}
        LIMIT ${LIST_LIMIT}
      )
      SELECT
        pv.id AS "variantId",
        p.name AS "productName",
        pv.sku AS "sku",
        COALESCE(SUM(ps.quantity), 0) AS "currentStock"
      FROM sold
      INNER JOIN product_variants pv ON pv.id = sold.variant_id
      INNER JOIN products p ON p.id = pv.product_id
      LEFT JOIN product_stocks ps ON ps.variant_id = pv.id ${branch ? `AND ps.branch_id = ${branch}` : ''}
      GROUP BY pv.id, p.name, pv.sku
      ORDER BY p.name ASC
      `,
      params.values,
    );
  }

  /** Ventas por día de la semana (1 = lunes … 7 = domingo) según la zona horaria del tenant. */
  dailySales(scope: DashboardScope, range: DateRange, timezone: string): Promise<WeekDayRow[]> {
    const { params, tenant, branchFilter } = this.scoped(scope);
    const refunded = params.add(SaleStatus.REFUNDED);
    const from = params.add(range.from);
    const to = params.add(range.to);
    const zone = params.add(timezone);

    return this.entityManager.query<WeekDayRow[]>(
      `
      SELECT
        TO_CHAR(s.created_at AT TIME ZONE ${zone}, 'ID') AS "dayOfWeek",
        COALESCE(SUM(s.total), 0) AS "total"
      FROM sales s
      WHERE s.tenant_id = ${tenant}
        ${branchFilter('s')}
        AND s.status != ${refunded}
        AND s.created_at BETWEEN ${from} AND ${to}
      GROUP BY "dayOfWeek"
      ORDER BY "dayOfWeek" ASC
      `,
      params.values,
    );
  }

  /** Total vendido en el rango. */
  async salesTotalInRange(scope: DashboardScope, range: DateRange): Promise<string> {
    const { params, tenant, branchFilter } = this.scoped(scope);
    const refunded = params.add(SaleStatus.REFUNDED);
    const from = params.add(range.from);
    const to = params.add(range.to);

    const rows = await this.entityManager.query<Array<{ total: string }>>(
      `
      SELECT COALESCE(SUM(s.total), 0) AS "total"
      FROM sales s
      WHERE s.tenant_id = ${tenant}
        ${branchFilter('s')}
        AND s.status != ${refunded}
        AND s.created_at BETWEEN ${from} AND ${to}
      `,
      params.values,
    );
    return rows[0]?.total ?? '0';
  }
}

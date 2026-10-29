import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { DateTime } from 'luxon';
import { GetDashboardMetricsQuery } from './get-dashboard-metrics.query';
import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';

export interface DashboardMetricsDto {
  today: {
    totalSales: number;
    itemsCount: number;
    netSales: number;
    netItemsCount: number;
    refunds: {
      totalRefunded: number;
      itemsCount: number;
      count: number;
    };
  };
  paymentMethods: {
    total: number;
    cash: { amount: number; percentage: number };
    card: { amount: number; percentage: number };
  };
  topProducts: Array<{
    variantId: string;
    productName: string;
    sku: string;
    imageUrl: string | null;
    quantitySold: number;
  }>;
  lowStockProducts: Array<{
    variantId: string;
    productName: string;
    sku: string;
    stock: number;
  }>;
  yesterdaySoldProducts: Array<{
    variantId: string;
    productName: string;
    sku: string;
    currentStock: number;
  }>;
  weekSummary: {
    totalWeek: number;
    changePercentage: number;
    dailyBreakdown: Array<{
      dayKey: string;
      label: string;
      total: number;
    }>;
  };
}

@QueryHandler(GetDashboardMetricsQuery)
export class GetDashboardMetricsHandler implements IQueryHandler<GetDashboardMetricsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetDashboardMetricsQuery): Promise<DashboardMetricsDto> {
    const { tenantId, branchId } = query;

    // 1. Obtener timezone del Tenant para calcular hoy, ayer y la semana exacta
    const tenant = await this.entityManager.getRepository(Tenant).findOne({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const tz = tenant?.timezone || 'America/Guayaquil';

    const now = DateTime.now().setZone(tz);
    const startOfToday = now.startOf('day').toJSDate();
    const endOfToday = now.endOf('day').toJSDate();

    const startOfYesterday = now.minus({ days: 1 }).startOf('day').toJSDate();
    const endOfYesterday = now.minus({ days: 1 }).endOf('day').toJSDate();

    // Semana actual (inicia el lunes)
    const startOfWeek = now.startOf('week').toJSDate();
    const endOfWeek = now.endOf('week').toJSDate();

    // Semana anterior (para calcular el % de variación)
    const startOfPrevWeek = now.minus({ weeks: 1 }).startOf('week').toJSDate();
    const endOfPrevWeek = now.minus({ weeks: 1 }).endOf('week').toJSDate();

    const thirtyDaysAgo = now.minus({ days: 30 }).startOf('day').toJSDate();
    const sixMonthsAgo = now.minus({ months: 6 }).startOf('day').toJSDate();

    const branchFilterSql = branchId ? 'AND s.branch_id = $2' : '';
    const branchFilterSql2 = branchId ? 'AND s2.branch_id = $2' : '';
    const refundBranchFilterSql = branchId ? 'AND r.branch_id = $2' : '';
    const refundBranchFilterSql2 = branchId ? 'AND r2.branch_id = $2' : '';

    const queryParamsToday: any[] = branchId ? [tenantId, branchId, startOfToday, endOfToday] : [tenantId, startOfToday, endOfToday];
    const todayStartIdx = branchId ? '$3' : '$2';
    const todayEndIdx = branchId ? '$4' : '$3';

    const topProductsParams: any[] = branchId ? [tenantId, branchId, thirtyDaysAgo] : [tenantId, thirtyDaysAgo];
    const topProductsDateIdx = branchId ? '$3' : '$2';

    const lowStockParams: any[] = branchId ? [tenantId, branchId, sixMonthsAgo] : [tenantId, sixMonthsAgo];
    const lowStockDateIdx = branchId ? '$3' : '$2';

    const yesterdayParams: any[] = branchId ? [tenantId, branchId, startOfYesterday, endOfYesterday] : [tenantId, startOfYesterday, endOfYesterday];
    const yesterdayStartIdx = branchId ? '$3' : '$2';
    const yesterdayEndIdx = branchId ? '$4' : '$3';

    const weekStartIdx = branchId ? '$3' : '$2';
    const weekEndIdx = branchId ? '$4' : '$3';

    const prevWeekStartIdx = branchId ? '$3' : '$2';
    const prevWeekEndIdx = branchId ? '$4' : '$3';

    // 2. Ejecutar consultas optimizadas en paralelo
    const [
      todaySalesRaw,
      todayRefundsRaw,
      paymentMethodsRaw,
      topProductsRaw,
      lowStockRaw,
      yesterdaySoldRaw,
      weekDailyRaw,
      prevWeekRaw,
    ] = await Promise.all([
      // A. Ventas Brutas de Hoy & Unidades Vendidas (filtradas de forma directa por hoy)
      this.entityManager.query(
        `
        SELECT 
          COALESCE(SUM(s.total), 0) AS "totalSales",
          COALESCE((
            SELECT SUM(si.quantity)
            FROM sale_items si
            INNER JOIN sales s2 ON s2.id = si.sale_id
            WHERE s2.tenant_id = $1
              ${branchFilterSql2}
              AND s2.status != 'REFUNDED'
              AND s2.created_at BETWEEN ${todayStartIdx} AND ${todayEndIdx}
          ), 0) AS "itemsCount"
        FROM sales s
        WHERE s.tenant_id = $1 
          ${branchFilterSql}
          AND s.status != 'REFUNDED'
          AND s.created_at BETWEEN ${todayStartIdx} AND ${todayEndIdx}
        `,
        queryParamsToday,
      ),

      // B. Devoluciones de Hoy & Unidades Devueltas (filtradas de forma directa por hoy)
      this.entityManager.query(
        `
        SELECT 
          COALESCE(SUM(r.total_refunded), 0) AS "totalRefunded",
          COALESCE((
            SELECT SUM(ri.quantity)
            FROM refund_items ri
            INNER JOIN refunds r2 ON r2.id = ri.refund_id
            WHERE r2.tenant_id = $1
              ${refundBranchFilterSql2}
              AND r2.created_at BETWEEN ${todayStartIdx} AND ${todayEndIdx}
          ), 0) AS "refundedItemsCount",
          COUNT(r.id) AS "refundsCount"
        FROM refunds r
        WHERE r.tenant_id = $1 
          ${refundBranchFilterSql}
          AND r.created_at BETWEEN ${todayStartIdx} AND ${todayEndIdx}
        `,
        queryParamsToday,
      ),

      // C. Métodos de Pago de Hoy
      this.entityManager.query(
        `
        SELECT 
          sp.payment_method AS "method",
          COALESCE(SUM(sp.amount), 0) AS "amount"
        FROM sale_payments sp
        INNER JOIN sales s ON s.id = sp.sale_id
        WHERE s.tenant_id = $1 
          ${branchFilterSql}
          AND s.status != 'REFUNDED'
          AND s.created_at BETWEEN ${todayStartIdx} AND ${todayEndIdx}
        GROUP BY sp.payment_method
        `,
        queryParamsToday,
      ),

      // D. Productos Más Vendidos (Top 5 en los últimos 30 días, filtrado con CTE eficiente)
      this.entityManager.query(
        `
        WITH top_variants AS (
          SELECT 
            si.variant_id,
            SUM(si.quantity) AS "quantitySold"
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE s.tenant_id = $1
            ${branchFilterSql}
            AND s.status != 'REFUNDED'
            AND s.created_at >= ${topProductsDateIdx}
          GROUP BY si.variant_id
          ORDER BY "quantitySold" DESC
          LIMIT 5
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
        topProductsParams,
      ),

      // E. Productos con Poco Inventario (<= 5 unidades en la sucursal, creados o con lotes en los últimos 6 meses - LIMIT 50)
      this.entityManager.query(
        `
        SELECT 
          pv.id AS "variantId",
          p.name AS "productName",
          pv.sku AS "sku",
          COALESCE(SUM(ps.quantity), 0) AS "stock"
        FROM product_variants pv
        INNER JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
        LEFT JOIN product_stocks ps ON ps.variant_id = pv.id ${branchId ? 'AND ps.branch_id = $2' : ''}
        WHERE pv.tenant_id = $1
          AND pv.deleted_at IS NULL
          AND (
            pv.created_at >= ${lowStockDateIdx}
            OR EXISTS (
              SELECT 1 FROM product_batches pb
              WHERE pb.variant_id = pv.id
                AND pb.created_at >= ${lowStockDateIdx}
                ${branchId ? 'AND pb.branch_id = $2' : ''}
            )
          )
        GROUP BY pv.id, p.name, pv.sku
        HAVING COALESCE(SUM(ps.quantity), 0) <= 5
        ORDER BY "stock" ASC
        LIMIT 50
        `,
        lowStockParams,
      ),

      // F. Productos Vendidos el Día Anterior (Ayer) con su Stock Actual (LIMIT 50 para evitar sobrecarga)
      this.entityManager.query(
        `
        WITH sold_yesterday AS (
          SELECT DISTINCT si.variant_id
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE s.tenant_id = $1
            ${branchFilterSql}
            AND s.status != 'REFUNDED'
            AND s.created_at BETWEEN ${yesterdayStartIdx} AND ${yesterdayEndIdx}
          LIMIT 50
        )
        SELECT 
          pv.id AS "variantId",
          p.name AS "productName",
          pv.sku AS "sku",
          COALESCE(SUM(ps.quantity), 0) AS "currentStock"
        FROM sold_yesterday sy
        INNER JOIN product_variants pv ON pv.id = sy.variant_id
        INNER JOIN products p ON p.id = pv.product_id
        LEFT JOIN product_stocks ps ON ps.variant_id = pv.id ${branchId ? 'AND ps.branch_id = $2' : ''}
        GROUP BY pv.id, p.name, pv.sku
        ORDER BY p.name ASC
        `,
        yesterdayParams,
      ),

      // G. Resumen Diario de la Semana Actual
      this.entityManager.query(
        `
        SELECT 
          TO_CHAR(s.created_at AT TIME ZONE '${tz}', 'YYYY-MM-DD') AS "dateKey",
          TO_CHAR(s.created_at AT TIME ZONE '${tz}', 'ID') AS "dayOfWeek",
          COALESCE(SUM(s.total), 0) AS "total"
        FROM sales s
        WHERE s.tenant_id = $1
          ${branchFilterSql}
          AND s.status != 'REFUNDED'
          AND s.created_at BETWEEN ${weekStartIdx} AND ${weekEndIdx}
        GROUP BY "dateKey", "dayOfWeek"
        ORDER BY "dateKey" ASC
        `,
        branchId ? [tenantId, branchId, startOfWeek, endOfWeek] : [tenantId, startOfWeek, endOfWeek],
      ),

      // H. Total de la Semana Anterior (para % comparativo)
      this.entityManager.query(
        `
        SELECT COALESCE(SUM(s.total), 0) AS "prevWeekTotal"
        FROM sales s
        WHERE s.tenant_id = $1
          ${branchFilterSql}
          AND s.status != 'REFUNDED'
          AND s.created_at BETWEEN ${prevWeekStartIdx} AND ${prevWeekEndIdx}
        `,
        branchId ? [tenantId, branchId, startOfPrevWeek, endOfPrevWeek] : [tenantId, startOfPrevWeek, endOfPrevWeek],
      ),
    ]);

    // 3. Procesar datos de Hoy
    const todayTotal = Number(todaySalesRaw[0]?.totalSales || 0);
    const todayItemsCount = Number(todaySalesRaw[0]?.itemsCount || 0);

    const todayRefundedAmount = Number(todayRefundsRaw[0]?.totalRefunded || 0);
    const todayRefundedItemsCount = Number(todayRefundsRaw[0]?.refundedItemsCount || 0);
    const todayRefundsCount = Number(todayRefundsRaw[0]?.refundsCount || 0);

    const todayNetSales = Math.max(0, todayTotal - todayRefundedAmount);
    const todayNetItemsCount = Math.max(0, todayItemsCount - todayRefundedItemsCount);

    // 4. Procesar Métodos de Pago
    let cashAmount = 0;
    let cardAmount = 0;
    for (const pm of paymentMethodsRaw) {
      const val = Number(pm.amount || 0);
      if (pm.method === 'EFECTIVO') cashAmount += val;
      if (pm.method === 'TARJETA') cardAmount += val;
    }
    const payTotal = cashAmount + cardAmount;
    const cashPercent = payTotal > 0 ? Math.round((cashAmount / payTotal) * 100) : 0;
    const cardPercent = payTotal > 0 ? Math.round((cardAmount / payTotal) * 100) : 0;

    // 5. Procesar Top Productos
    const s3PublicUrl = process.env.AWS_S3_PUBLIC_URL || '';
    const topProducts = topProductsRaw.map((item: any) => ({
      variantId: item.variantId,
      productName: item.productName,
      sku: item.sku,
      imageUrl: item.imageUrl ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${s3PublicUrl}/${item.imageUrl}`) : null,
      quantitySold: Number(item.quantitySold || 0),
    }));

    // 6. Procesar Productos con Poco Stock
    const lowStockProducts = lowStockRaw.map((item: any) => ({
      variantId: item.variantId,
      productName: item.productName,
      sku: item.sku,
      stock: Number(item.stock || 0),
    }));

    // 7. Procesar Vendidos Ayer
    const yesterdaySoldProducts = yesterdaySoldRaw.map((item: any) => ({
      variantId: item.variantId,
      productName: item.productName,
      sku: item.sku,
      currentStock: Number(item.currentStock || 0),
    }));

    // 8. Procesar Semana Actual y variación
    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const weekMap = new Map<number, number>();
    for (let d = 1; d <= 7; d++) {
      weekMap.set(d, 0);
    }

    let currentWeekTotal = 0;
    for (const row of weekDailyRaw) {
      const dow = Number(row.dayOfWeek); // 1 = Monday, 7 = Sunday en ISO
      const total = Number(row.total || 0);
      weekMap.set(dow, total);
      currentWeekTotal += total;
    }

    const dailyBreakdown = dayNames.map((label, idx) => ({
      dayKey: String(idx + 1),
      label,
      total: weekMap.get(idx + 1) || 0,
    }));

    const prevWeekTotal = Number(prevWeekRaw[0]?.prevWeekTotal || 0);
    let changePercentage = 0;
    if (prevWeekTotal > 0) {
      changePercentage = Math.round(((currentWeekTotal - prevWeekTotal) / prevWeekTotal) * 100);
    } else if (currentWeekTotal > 0) {
      changePercentage = 100;
    }

    return {
      today: {
        totalSales: Number(todayTotal.toFixed(2)),
        itemsCount: todayItemsCount,
        netSales: Number(todayNetSales.toFixed(2)),
        netItemsCount: todayNetItemsCount,
        refunds: {
          totalRefunded: Number(todayRefundedAmount.toFixed(2)),
          itemsCount: todayRefundedItemsCount,
          count: todayRefundsCount,
        },
      },
      paymentMethods: {
        total: Number(payTotal.toFixed(2)),
        cash: { amount: Number(cashAmount.toFixed(2)), percentage: cashPercent },
        card: { amount: Number(cardAmount.toFixed(2)), percentage: cardPercent },
      },
      topProducts,
      lowStockProducts,
      yesterdaySoldProducts,
      weekSummary: {
        totalWeek: Number(currentWeekTotal.toFixed(2)),
        changePercentage,
        dailyBreakdown,
      },
    };
  }
}

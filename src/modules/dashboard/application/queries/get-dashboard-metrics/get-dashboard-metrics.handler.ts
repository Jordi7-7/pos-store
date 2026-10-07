import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { DateTime } from 'luxon';
import { GetDashboardMetricsQuery } from './get-dashboard-metrics.query';
import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';

export interface DashboardMetricsDto {
  today: {
    totalSales: number;
    itemsCount: number;
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

    const sixMonthsAgo = now.minus({ months: 6 }).startOf('day').toJSDate();

    const branchFilterSql = branchId ? 'AND s.branch_id = $2' : '';
    const queryParamsToday: any[] = branchId ? [tenantId, branchId, startOfToday, endOfToday] : [tenantId, startOfToday, endOfToday];
    const todayStartIdx = branchId ? '$3' : '$2';
    const todayEndIdx = branchId ? '$4' : '$3';

    const yesterdayStartIdx = branchId ? '$3' : '$2';
    const yesterdayEndIdx = branchId ? '$4' : '$3';

    const weekStartIdx = branchId ? '$3' : '$2';
    const weekEndIdx = branchId ? '$4' : '$3';

    const prevWeekStartIdx = branchId ? '$3' : '$2';
    const prevWeekEndIdx = branchId ? '$4' : '$3';

    const lowStockParams: any[] = branchId ? [tenantId, branchId, sixMonthsAgo] : [tenantId, sixMonthsAgo];
    const lowStockDateIdx = branchId ? '$3' : '$2';

    // 2. Ejecutar consultas optimizadas en paralelo
    const [
      todaySalesRaw,
      paymentMethodsRaw,
      topProductsRaw,
      lowStockRaw,
      yesterdaySoldRaw,
      weekDailyRaw,
      prevWeekRaw,
    ] = await Promise.all([
      // A. Ventas de Hoy & Unidades Vendidas
      this.entityManager.query(
        `
        SELECT 
          COALESCE(SUM(s.total), 0) AS "totalSales",
          COALESCE(SUM(items.qty), 0) AS "itemsCount"
        FROM sales s
        LEFT JOIN (
          SELECT sale_id, SUM(quantity) AS qty
          FROM sale_items
          GROUP BY sale_id
        ) items ON items.sale_id = s.id
        WHERE s.tenant_id = $1 
          ${branchFilterSql}
          AND s.status != 'REFUNDED'
          AND s.created_at BETWEEN ${todayStartIdx} AND ${todayEndIdx}
        `,
        queryParamsToday,
      ),

      // B. Métodos de Pago de Hoy
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

      // C. Productos Más Vendidos (Top 5 del mes o histórico reciente)
      this.entityManager.query(
        `
        SELECT 
          pv.id AS "variantId",
          COALESCE(p.name, '') AS "productName",
          pv.sku AS "sku",
          pi.url AS "imageUrl",
          SUM(si.quantity) AS "quantitySold"
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        INNER JOIN product_variants pv ON pv.id = si.variant_id
        INNER JOIN products p ON p.id = pv.product_id
        LEFT JOIN LATERAL (
          SELECT pim.url 
          FROM product_image_mappings pimap
          INNER JOIN product_images pim ON pim.id = pimap.product_image_id
          WHERE pimap.product_id = p.id
          LIMIT 1
        ) pi ON true
        WHERE s.tenant_id = $1
          ${branchFilterSql}
          AND s.status != 'REFUNDED'
        GROUP BY pv.id, p.name, pv.sku, pi.url
        ORDER BY "quantitySold" DESC
        LIMIT 5
        `,
        branchId ? [tenantId, branchId] : [tenantId],
      ),

      // D. Productos con Poco Inventario (<= 5 unidades en la sucursal, creados o con lotes en los últimos 6 meses)
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
        `,
        lowStockParams,
      ),

      // E. Productos Vendidos el Día Anterior (Ayer) con su Stock Actual (sin límite para permitir scroll)
      this.entityManager.query(
        `
        SELECT DISTINCT
          pv.id AS "variantId",
          p.name AS "productName",
          pv.sku AS "sku",
          COALESCE(stocks.current_stock, 0) AS "currentStock"
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        INNER JOIN product_variants pv ON pv.id = si.variant_id
        INNER JOIN products p ON p.id = pv.product_id
        LEFT JOIN (
          SELECT variant_id, SUM(quantity) as current_stock
          FROM product_stocks
          ${branchId ? 'WHERE branch_id = $2' : ''}
          GROUP BY variant_id
        ) stocks ON stocks.variant_id = pv.id
        WHERE s.tenant_id = $1
          ${branchFilterSql}
          AND s.status != 'REFUNDED'
          AND s.created_at BETWEEN ${yesterdayStartIdx} AND ${yesterdayEndIdx}
        ORDER BY p.name ASC
        `,
        branchId ? [tenantId, branchId, startOfYesterday, endOfYesterday] : [tenantId, startOfYesterday, endOfYesterday],
      ),

      // F. Resumen Diario de la Semana Actual
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

      // G. Total de la Semana Anterior (para % comparativo)
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

import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetProductSalesReportQuery } from './get-product-sales-report.query';
import { parseReportDates } from '../parse-dates.helper';
import { SaleStatus } from '../../../../../common/enums/sale-status.enum';

export interface ProductSaleRow {
  variantId: string;
  sku: string;
  name: string;
  soldQuantity: number;
  currentStock: number;
  salePrice: number;
  totalRevenue: number;
  createdAt: string;
  invoiceNumber?: string;
}

@QueryHandler(GetProductSalesReportQuery)
export class GetProductSalesReportHandler implements IQueryHandler<GetProductSalesReportQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductSalesReportQuery): Promise<ProductSaleRow[]> {
    const { start, end } = await parseReportDates(
      this.entityManager,
      query.tenantId,
      query.startDateStr,
      query.endDateStr,
    );

    // Consulta SQL:
    // Agrupa por variante, precio efectivo vendido y fecha/hora exacta de la venta (o ticket)
    const rawData = await this.entityManager.query(
      `
      WITH item_level_sales AS (
        SELECT 
          si.variant_id AS variant_id,
          s.created_at AS sale_date,
          s.invoice_number AS invoice_number,
          GREATEST(0, si.quantity - COALESCE(si.refunded_quantity, 0)) AS net_qty,
          ROUND(
            (
              si.price - (
                (COALESCE(si.discount_amount, 0) + COALESCE(si.global_discount_amount, 0)) / NULLIF(si.quantity, 0)
              )
            )::numeric,
            2
          ) AS unit_sold_price,
          (
            GREATEST(0, si.quantity - COALESCE(si.refunded_quantity, 0)) * (
              si.price - (
                (COALESCE(si.discount_amount, 0) + COALESCE(si.global_discount_amount, 0)) / NULLIF(si.quantity, 0)
              )
            )
          ) AS line_revenue
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE s.tenant_id = $1
          AND s.created_at BETWEEN $2 AND $3
          AND s.status IN ($4, $5)
      ),
      sales_aggregated AS (
        SELECT 
          variant_id,
          sale_date,
          invoice_number,
          unit_sold_price,
          SUM(net_qty) AS sold_qty,
          SUM(line_revenue) AS total_revenue
        FROM item_level_sales
        GROUP BY variant_id, sale_date, invoice_number, unit_sold_price
        HAVING SUM(net_qty) > 0
      ),
      variant_stocks AS (
        SELECT 
          variant_id, 
          COALESCE(SUM(quantity), 0) AS total_stock
        FROM product_stocks
        GROUP BY variant_id
      ),
      variant_attributes AS (
        SELECT 
          vav.variant_id,
          STRING_AGG(av.value, ' / ' ORDER BY av.value) AS attr_values
        FROM variant_attribute_values vav
        INNER JOIN attribute_values av ON av.id = vav.attribute_value_id
        GROUP BY vav.variant_id
      )
      SELECT 
        sa.variant_id AS "variantId",
        COALESCE(pv.sku, '') AS "sku",
        CASE 
          WHEN va.attr_values IS NOT NULL AND va.attr_values <> '' 
            THEN CONCAT(COALESCE(p.name, 'Producto'), ' (', va.attr_values, ')')
          ELSE COALESCE(p.name, 'Producto')
        END AS "name",
        ROUND(sa.sold_qty::numeric, 2) AS "soldQuantity",
        ROUND(COALESCE(vs.total_stock, 0)::numeric, 2) AS "currentStock",
        ROUND(sa.unit_sold_price::numeric, 2) AS "salePrice",
        ROUND(sa.total_revenue::numeric, 2) AS "totalRevenue",
        sa.sale_date AS "createdAt",
        COALESCE(sa.invoice_number, '') AS "invoiceNumber"
      FROM sales_aggregated sa
      INNER JOIN product_variants pv ON pv.id = sa.variant_id
      INNER JOIN products p ON p.id = pv.product_id
      LEFT JOIN variant_stocks vs ON vs.variant_id = sa.variant_id
      LEFT JOIN variant_attributes va ON va.variant_id = sa.variant_id
      ORDER BY pv.sku ASC, sa.sale_date DESC, sa.unit_sold_price DESC;
      `,
      [query.tenantId, start, end, SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED],
    );

    return rawData.map((row: any) => ({
      variantId: row.variantId,
      sku: row.sku || '',
      name: row.name || 'Producto',
      soldQuantity: Number(row.soldQuantity || 0),
      currentStock: Number(row.currentStock || 0),
      salePrice: Number(row.salePrice || 0),
      totalRevenue: Number(row.totalRevenue || 0),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      invoiceNumber: row.invoiceNumber || undefined,
    }));
  }
}

import { StockStatus } from '../../../domain/enums/stock-status.enum';

export interface StockStatusCondition {
  sql: string;
  params: Record<string, string>;
}

/**
 * Condición SQL (sobre el alias `product`) que deja solo los productos en ese estado de existencias. Se resuelve en la base
 * de datos y no en el navegador para que funcione con la paginación. Todos los estados se calculan sobre las mismas filas:
 * las de stock de las variantes no borradas, de la sucursal pedida o de todas.
 */
export function stockStatusCondition(status: StockStatus, branchId: string | undefined): StockStatusCondition {
  const stockRows = `
    SELECT 1 FROM product_variants pv
    INNER JOIN product_stocks ps ON ps.variant_id = pv.id
    WHERE pv.product_id = product.id
      AND pv.deleted_at IS NULL
      ${branchId ? 'AND ps.branch_id = :stockBranchId' : ''}`;
  const params: Record<string, string> = branchId ? { stockBranchId: branchId } : {};

  switch (status) {
    case StockStatus.IN_STOCK:
      return { sql: `EXISTS (${stockRows} AND ps.quantity > 0)`, params };
    case StockStatus.NEGATIVE:
      return { sql: `EXISTS (${stockRows} AND ps.quantity < 0)`, params };
    case StockStatus.ZERO:
      return { sql: `NOT EXISTS (${stockRows} AND ps.quantity <> 0)`, params };
  }
}

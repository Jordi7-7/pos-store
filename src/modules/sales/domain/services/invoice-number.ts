/** Número de factura `SSS-CCC-NNNNNNNNN`: sucursal, caja y secuencia de la caja, con ceros a la izquierda. */
export function formatInvoiceNumber(branchCode: number | null | undefined, registerCode: number | null | undefined, sequence: number): string {
  const branch = String(branchCode || 1).padStart(3, '0');
  const register = String(registerCode || 1).padStart(3, '0');
  return `${branch}-${register}-${String(sequence).padStart(9, '0')}`;
}

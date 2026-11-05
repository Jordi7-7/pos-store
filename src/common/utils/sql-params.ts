/**
 * Acumula los parámetros de una consulta SQL cruda y devuelve su marcador (`$1`, `$2`...).
 * Evita llevar la cuenta de los índices a mano y obliga a pasar todo valor como parámetro,
 * nunca concatenado en el texto SQL.
 *
 *   const params = new SqlParams();
 *   const tenant = params.add(tenantId);
 *   sql = `... WHERE tenant_id = ${tenant}`;
 *   manager.query(sql, params.values);
 */
export class SqlParams {
  private readonly collected: unknown[] = [];

  add(value: unknown): string {
    this.collected.push(value);
    return `$${this.collected.length}`;
  }

  get values(): unknown[] {
    return [...this.collected];
  }
}

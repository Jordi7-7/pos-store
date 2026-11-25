import { ImportRow } from '../../../domain/import-plan';

export class ImportVariantProductsCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    /** Sucursal donde se guardan las existencias del archivo. */
    public readonly branchId: string | undefined,
    /** Solo valida y cuenta lo que se crearía; no escribe nada. */
    public readonly dryRun: boolean,
    public readonly rows: ImportRow[],
  ) {}
}

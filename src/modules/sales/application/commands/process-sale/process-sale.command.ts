import { ProcessSaleDto } from './process-sale.dto';

export class ProcessSaleCommand {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
    public readonly cashSessionId: string,
    public readonly customerId: string | undefined,
    public readonly items: any[],
    public readonly payments: any[],
  ) {}
}

import { UpdateSupplierDto } from './update-supplier.dto';

export class UpdateSupplierCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly dto: UpdateSupplierDto,
  ) {}
}

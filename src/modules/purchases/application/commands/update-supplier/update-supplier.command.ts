export interface UpdateSupplierInput {
  identityNumber?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export class UpdateSupplierCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly input: UpdateSupplierInput,
  ) {}
}

export interface UpdateCustomerInput {
  identityNumber?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
}

export class UpdateCustomerCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly input: UpdateCustomerInput,
  ) {}
}

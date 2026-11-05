export interface CreateCustomerInput {
  identityNumber: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export class CreateCustomerCommand {
  constructor(
    public readonly tenantId: string,
    public readonly input: CreateCustomerInput,
  ) {}
}

export class PinLoginCommand {
  constructor(
    public readonly tenantId: string,  // Extracted from admin JWT
    public readonly pin: string,
  ) {}
}

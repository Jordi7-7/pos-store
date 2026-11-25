export class CloseCashSessionCommand {
  constructor(
    public readonly tenantId: string,
    /** Quien cierra el turno: debe tener asignada la caja (o ser propietario). */
    public readonly userId: string,
    public readonly id: string,
    public readonly closingBalance: number,
  ) {}
}

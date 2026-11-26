export class ReorderAttributeValuesCommand {
  constructor(
    public readonly tenantId: string,
    public readonly attributeId: string,
    /** Todas las opciones vigentes del atributo, en el orden en que deben salir. */
    public readonly valueIds: string[],
  ) {}
}

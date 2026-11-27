/** Una foto de la galería y su destino: un producto o una variante (exactamente uno). */
export interface ImageAssignment {
  imageId: string;
  productId?: string;
  variantId?: string;
}

export class AssignProductImagesCommand {
  constructor(
    public readonly tenantId: string,
    public readonly items: ImageAssignment[],
  ) {}
}

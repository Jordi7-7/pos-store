/** Los datos con los que se da de alta una variante. */
export interface VariantInput {
  sku: string;
  barcode?: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice?: number | null;
  imageIds?: string[];
  attributeValues?: Array<{ attributeValueId: string }>;
  stocks?: Array<{ branchId: string; quantity: number }>;
}

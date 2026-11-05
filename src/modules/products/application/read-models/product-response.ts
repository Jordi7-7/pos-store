import { ProductType } from '../../domain/enums/product-type.enum';

export interface ProductImageResponseDto {
  id: string;
  url: string;
}
export interface VariantAttributeResponseDto {
  name: string;
  value: string;
}

export interface VariantStockResponseDto {
  branchId: string;
  branchName: string;
  quantity: number;
}

export interface ProductVariantResponseDto {
  id: string;
  sku: string;
  barcode: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice: number | null;
  images: ProductImageResponseDto[];
  attributes?: VariantAttributeResponseDto[];
  stocks: VariantStockResponseDto[];
}

export interface ProductListItemResponseDto {
  id: string;
  name: string;
  description: string;
  type: ProductType;
  baseSku: string | null;
  categoryId: string | null;
  categoryName: string | null;
  images: ProductImageResponseDto[];
  variants: ProductVariantResponseDto[];
}

export interface PaginatedProductsResponseDto {
  data: ProductListItemResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

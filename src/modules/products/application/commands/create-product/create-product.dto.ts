import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class VariantAttributeValueDto {
  @IsUUID()
  attributeValueId: string;
}

export class ProductVariantStockDto {
  @IsUUID()
  branchId: string;

  @IsNumber()
  quantity: number;
}

export class ProductVariantDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  barcode: string;

  @IsNumber()
  purchasePrice: number;

  @IsNumber()
  salePrice: number;

  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  imageIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeValueDto)
  attributeValues: VariantAttributeValueDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantStockDto)
  stocks?: ProductVariantStockDto[];
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  description: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  imageIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants: ProductVariantDto[];
}

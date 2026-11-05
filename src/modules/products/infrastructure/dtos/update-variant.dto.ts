import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsUUID } from 'class-validator';

export class UpdateVariantDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsNumber()
  @IsOptional()
  purchasePrice?: number;

  @IsNumber()
  @IsOptional()
  salePrice?: number;

  @IsNumber()
  @IsOptional()
  wholesalePrice?: number | null;

  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  imageIds?: string[];
}

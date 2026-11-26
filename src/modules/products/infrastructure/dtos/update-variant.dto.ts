import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsUUID, Min } from 'class-validator';

export class UpdateVariantDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  wholesalePrice?: number | null;

  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  imageIds?: string[];
}

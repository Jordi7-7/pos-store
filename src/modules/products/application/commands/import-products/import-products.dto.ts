import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ValidateProductItemDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}

export class ValidateImportProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidateProductItemDto)
  items: ValidateProductItemDto[];
}

export class ImportProductItemDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsNumber()
  purchasePrice: number;

  @IsNumber()
  salePrice: number;

  @IsNumber()
  quantity: number;
}

export class ImportProductsDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProductItemDto)
  items: ImportProductItemDto[];
}

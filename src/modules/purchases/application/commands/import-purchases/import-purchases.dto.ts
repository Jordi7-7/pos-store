import { IsString, IsNotEmpty, IsNumber, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ValidatePurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsNumber()
  quantity: number;
}

export class ValidateImportPurchasesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidatePurchaseItemDto)
  items: ValidatePurchaseItemDto[];
}

export class ImportPurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsNumber()
  quantity: number;
}

export class ImportPurchasesDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportPurchaseItemDto)
  items: ImportPurchaseItemDto[];
}

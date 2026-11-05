import { IsString, IsNotEmpty, IsNumber, IsUUID, IsEnum, IsOptional } from 'class-validator';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';

export class AdjustStockDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  @IsNotEmpty()
  variantId: string;

  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @IsEnum(InventoryMovementType)
  @IsNotEmpty()
  type: InventoryMovementType;

  @IsString()
  @IsOptional()
  comment?: string;
}

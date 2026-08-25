import { IsString, IsNotEmpty, IsNumber, IsUUID, IsIn, IsOptional } from 'class-validator';

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

  @IsIn(['IN', 'OUT'])
  @IsNotEmpty()
  type: 'IN' | 'OUT';

  @IsIn(['ROBBERY', 'DAMAGE', 'EXPIRED', 'ADJUSTMENT', 'INTERNAL_USE'])
  @IsNotEmpty()
  reason: 'ROBBERY' | 'DAMAGE' | 'EXPIRED' | 'ADJUSTMENT' | 'INTERNAL_USE';

  @IsString()
  @IsOptional()
  comment?: string;
}

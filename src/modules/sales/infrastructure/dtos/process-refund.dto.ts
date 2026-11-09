import { IsOptional, IsUUID, IsNotEmpty, IsArray, ValidateNested, IsNumber, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class RefundItemDto {
  @IsUUID()
  @IsNotEmpty()
  variantId: string;

  /** Línea exacta de la venta a devolver. Sin ella se consumen las líneas de la variante en orden. */
  @IsOptional()
  @IsUUID()
  saleItemId?: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class ProcessRefundDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  @IsNotEmpty()
  saleId: string;

  @IsUUID()
  @IsNotEmpty()
  cashSessionId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundItemDto)
  items: RefundItemDto[];
}

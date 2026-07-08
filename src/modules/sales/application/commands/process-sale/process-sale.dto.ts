import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../domain/entities/sale-payment.entity';

export class SaleItemDto {
  @IsUUID()
  variantId: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  price: number;
}

export class SalePaymentDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  referenceNumber?: string;
}

export class ProcessSaleDto {
  @IsUUID()
  branchId: string;

  @IsUUID()
  cashSessionId: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}

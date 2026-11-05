import { IsString, IsOptional, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested, IsNumber, IsPositive, IsUUID, IsEnum, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../domain/entities/sale-payment.entity';

export class SaleItemDto {
  @IsUUID()
  variantId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  discountType?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;
}

export class SalePaymentDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
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

  @IsString()
  @IsOptional()
  @MaxLength(30)
  discountType?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}

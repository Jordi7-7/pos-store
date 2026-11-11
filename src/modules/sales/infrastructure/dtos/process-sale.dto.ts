import { IsISO8601, IsString, IsOptional, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested, IsNumber, IsPositive, IsUUID, IsEnum, Matches, Max, MaxLength, Min } from 'class-validator';
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

/** Lo común a cobrar una venta; es igual en línea y sin conexión (misma lógica de precios, stock y folio). */
export abstract class SaleBodyDto {
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

/** Venta en línea (POS). `clientRequestId` es opcional hoy y se volverá obligatorio cuando todos los clientes lo envíen. */
export class ProcessSaleDto extends SaleBodyDto {
  /** Idempotencia: un valor único por intento de cobro (UUID u otro texto de 8 a 64 caracteres). */
  @IsString()
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'clientRequestId debe tener de 8 a 64 caracteres (letras, números, guion o guion bajo).' })
  clientRequestId?: string;
}

/**
 * Venta hecha sin conexión que se sincroniza después (`POST /sales/offline`). Los tres datos son obligatorios y
 * van siempre juntos: la clave de idempotencia, la hora real del cobro y el número provisional del comprobante.
 */
export class ProcessOfflineSaleDto extends SaleBodyDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'clientRequestId debe tener de 8 a 64 caracteres (letras, números, guion o guion bajo).' })
  clientRequestId: string;

  /** La hora real en que se cobró (ISO 8601). Se acota al turno abierto y a "ahora". */
  @IsISO8601()
  occurredAt: string;

  /** El número provisional impreso en el comprobante (se guarda en MAYÚSCULAS). */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{6,40}$/, { message: 'offlineReference debe tener de 6 a 40 caracteres (letras, números, guion o guion bajo).' })
  offlineReference: string;
}

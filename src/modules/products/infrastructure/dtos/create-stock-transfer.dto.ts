import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_DOCUMENT_LINES } from '../../domain/services/inventory-document-rules';

export class StockTransferLineDto {
  @IsUUID()
  variantId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;
}

export class CreateStockTransferDto {
  /** Sucursal de la que sale la mercancía. */
  @IsUUID()
  originBranchId: string;

  /** Sucursal que la recibe. */
  @IsUUID()
  destinationBranchId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsUUID()
  clientRequestId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => StockTransferLineDto)
  lines: StockTransferLineDto[];
}

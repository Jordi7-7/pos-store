import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_DOCUMENT_LINES } from '../../domain/services/inventory-document-rules';

export class StockCountLineDto {
  @IsUUID()
  variantId: string;

  /** Lo contado físicamente. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  counted: number;

  /** Lo que el sistema decía cuando se agregó la línea (puede ser negativo si las ventas dejaron el stock debajo de 0). */
  @IsNumber({ maxDecimalPlaces: 2 })
  expected: number;

  /** Costo de lo que sobra; sin él, el costo de compra de la variante. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;
}

export class CreateStockCountDto {
  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsUUID()
  clientRequestId?: string;

  /** Confirma que se aplique aunque el stock haya cambiado desde que se vio. */
  @IsOptional()
  @IsBoolean()
  acceptStockChanges?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => StockCountLineDto)
  lines: StockCountLineDto[];
}

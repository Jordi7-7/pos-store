import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { MANUAL_REASONS, MAX_DOCUMENT_LINES } from '../../domain/services/inventory-document-rules';

export class InventoryDocumentLineDto {
  @IsUUID()
  variantId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  /** Solo en entradas. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;
}

export class CreateInventoryDocumentDto {
  @IsUUID()
  branchId: string;

  @IsIn([InventoryDocumentKind.ENTRY, InventoryDocumentKind.EXIT])
  kind: InventoryDocumentKind.ENTRY | InventoryDocumentKind.EXIT;

  /** El motivo debe ser uno de los manuales; que corresponda al tipo lo valida el caso de uso. */
  @IsString()
  @IsIn([...MANUAL_REASONS.ENTRY, ...MANUAL_REASONS.EXIT])
  reason: string;

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
  @Type(() => InventoryDocumentLineDto)
  lines: InventoryDocumentLineDto[];
}

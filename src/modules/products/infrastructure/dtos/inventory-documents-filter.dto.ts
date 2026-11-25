import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { blankToUndefined } from '../../../../common/utils/query-values';

/** Filtros de la lista de documentos de inventario; todos opcionales. */
export class InventoryDocumentsFilterDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsEnum(InventoryDocumentKind)
  kind?: InventoryDocumentKind;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

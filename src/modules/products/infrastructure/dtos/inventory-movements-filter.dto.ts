import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { blankToUndefined } from '../../../../common/utils/query-values';
import { InventoryMovementCategory } from '../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';

/** Filtros del historial global de movimientos; todos opcionales. */
export class InventoryMovementsFilterDto {
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
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsEnum(InventoryMovementCategory)
  category?: InventoryMovementCategory;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsString()
  @MaxLength(50)
  reason?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsUUID()
  variantId?: string;

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

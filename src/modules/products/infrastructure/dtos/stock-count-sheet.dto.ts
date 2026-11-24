import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { blankToUndefined } from '../../../../common/utils/query-values';

/** Filtros de la lista de variantes para armar un conteo. */
export class StockCountSheetFilterDto {
  @IsUUID()
  branchId: string;

  @IsOptional()
  @Transform(({ value }) => blankToUndefined(value))
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyWithStock?: boolean;

  @IsOptional()
  @Transform(({ value }) => blankToUndefined(value))
  @IsString()
  @MaxLength(100)
  after?: string;

  @IsOptional()
  limit?: number;
}

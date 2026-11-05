import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { blankToUndefined } from '../../../../common/utils/query-values';

export class GetValuedInventoryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

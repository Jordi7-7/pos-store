import { Transform } from 'class-transformer';
import { IsOptional, IsISO8601, IsUUID } from 'class-validator';
import { blankToUndefined } from '../../../../common/utils/query-values';

export class GetReportDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

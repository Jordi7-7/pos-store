import { IsOptional, IsUUID } from 'class-validator';

export class DashboardMetricsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

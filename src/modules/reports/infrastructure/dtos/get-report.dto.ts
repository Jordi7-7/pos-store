import { IsString, IsOptional, IsISO8601 } from 'class-validator';

export class GetReportDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

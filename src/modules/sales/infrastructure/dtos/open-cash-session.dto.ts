import { IsUUID, IsNumber, Min, IsNotEmpty } from 'class-validator';

export class OpenCashSessionDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  @IsNotEmpty()
  cashRegisterId: string;

  @IsNumber()
  @Min(0)
  openingBalance: number;
}


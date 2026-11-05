import { IsUUID, IsNotEmpty, IsString, IsNumber, Min, IsOptional } from 'class-validator';

export class RegisterExpenseDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  @IsOptional()
  cashSessionId?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  category: string;
}

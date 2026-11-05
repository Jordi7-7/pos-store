import { IsNumber, Min } from 'class-validator';

export class CloseCashSessionDto {
  @IsNumber()
  @Min(0)
  closingBalance: number;
}

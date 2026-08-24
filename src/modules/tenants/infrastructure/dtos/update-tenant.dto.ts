import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  country?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  currencyCode?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  timezone?: string;
}

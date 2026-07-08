import { IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';

export class OnboardTenantDto {
  // Tenant Details
  @IsString()
  @IsNotEmpty()
  tenantName: string;

  @IsString()
  @IsNotEmpty()
  ruc: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  currencyCode: string;

  @IsString()
  @IsNotEmpty()
  currencySymbol: string;

  // Admin User Details
  @IsString()
  @IsNotEmpty()
  adminName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  // Primary Branch Name
  @IsString()
  @IsNotEmpty()
  branchName: string;

  @IsString()
  @IsNotEmpty()
  branchAddress: string;
}

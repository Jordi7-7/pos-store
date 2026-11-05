import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional, IsTimeZone } from 'class-validator';

export class OnboardTenantDto {
  // Tenant Details
  @IsString()
  @IsNotEmpty()
  tenantName: string;

  @IsString()
  @IsOptional()
  slug?: string;

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

  @IsTimeZone({ message: 'La zona horaria no es válida (ej. America/Guayaquil).' })
  timezone: string;

  // Admin User Details
  @IsString()
  @IsNotEmpty()
  adminName: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsOptional()
  email?: string;

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

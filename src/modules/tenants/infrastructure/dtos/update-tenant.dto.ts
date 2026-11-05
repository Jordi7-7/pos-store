import { IsString, IsNotEmpty, IsOptional, IsTimeZone } from 'class-validator';

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

  @IsTimeZone({ message: 'La zona horaria no es válida (ej. America/Guayaquil).' })
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;
}

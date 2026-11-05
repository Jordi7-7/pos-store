import { IsString, IsNotEmpty, IsOptional, IsTimeZone, IsISO4217CurrencyCode, MaxLength } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  country?: string;

  @IsISO4217CurrencyCode({ message: 'El código de moneda no es válido (ej. USD).' })
  @IsOptional()
  currencyCode?: string;

  @IsTimeZone({ message: 'La zona horaria no es válida (ej. America/Guayaquil).' })
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @IsOptional()
  slug?: string;

  @IsString()
  @MaxLength(2048)
  @IsOptional()
  logoUrl?: string;
}

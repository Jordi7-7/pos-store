import { IsString, IsNotEmpty, IsOptional, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  // El tope evita que una contraseña enorme obligue al servidor a procesar megabytes por intento
  @IsString()
  @MinLength(4)
  @MaxLength(256)
  password: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  tenantSlug?: string;
}

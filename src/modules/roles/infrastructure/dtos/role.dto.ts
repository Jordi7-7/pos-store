import { IsString, IsNotEmpty, IsOptional, IsArray, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del rol es obligatorio.' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres.' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray({ message: 'Los permisos deben ser una lista de textos.' })
  @IsString({ each: true, message: 'Cada permiso debe ser un código válido.' })
  permissions: string[];
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres.' })
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray({ message: 'Los permisos deben ser una lista de textos.' })
  @IsString({ each: true, message: 'Cada permiso debe ser un código válido.' })
  @IsOptional()
  permissions?: string[];
}

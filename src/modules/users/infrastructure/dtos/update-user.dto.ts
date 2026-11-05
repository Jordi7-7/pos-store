import { IsString, IsEmail, MinLength, IsOptional, IsBoolean, IsArray, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos.' })
  username?: string;

  @IsEmail({}, { message: 'El formato del correo electrónico no es válido.' })
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  roleId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  customPermissions?: string[];

  @IsString()
  @IsOptional()
  @Matches(/^(\d{4,8})?$/, { message: 'El PIN debe tener entre 4 y 8 dígitos.' })
  pin?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  branchIds?: string[];
}

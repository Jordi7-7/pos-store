import { IsString, IsEmail, MinLength, IsOptional, IsBoolean, Matches } from 'class-validator';

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

  @IsOptional()
  customPermissions?: string[];

  @IsString()
  @IsOptional()
  pin?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  branchIds?: string[];
}

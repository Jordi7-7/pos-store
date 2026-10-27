import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre de usuario es obligatorio.' })
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos.' })
  username: string;

  @IsEmail({}, { message: 'El formato del correo electrónico no es válido.' })
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  roleId?: string;

  @IsOptional()
  customPermissions?: string[];

  @IsString()
  @IsOptional()
  pin?: string;

  @IsOptional()
  branchIds?: string[];
}

import { IsString, IsNotEmpty, IsEmail, MinLength, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../../../enums/user-role.enum';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsOptional()
  pin?: string;
}

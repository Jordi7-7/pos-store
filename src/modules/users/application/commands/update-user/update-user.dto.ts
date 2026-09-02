import { IsString, IsEmail, MinLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { UserRole } from '../../../enums/user-role.enum';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  pin?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

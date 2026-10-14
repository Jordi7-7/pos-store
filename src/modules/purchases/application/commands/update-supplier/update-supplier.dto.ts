import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  identityNumber?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;
}

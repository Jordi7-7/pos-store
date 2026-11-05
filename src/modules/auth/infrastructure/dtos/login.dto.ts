import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(4)
  password: string;

  @IsString()
  @IsOptional()
  tenantSlug?: string;
}

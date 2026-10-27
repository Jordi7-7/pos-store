import { IsString, IsEmail, IsOptional, ValidateIf } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  identityNumber: string;

  @IsString()
  name: string;

  @ValidateIf((o) => o.email !== '' && o.email !== null && o.email !== undefined)
  @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
  @IsOptional()
  email?: string | null;

  @IsString()
  @IsOptional()
  phone?: string | null;
}

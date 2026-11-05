import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class PinLoginDto {
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'El PIN debe tener entre 4 y 8 dígitos.' })
  pin: string;

  @IsString()
  @IsNotEmpty({ message: 'El identificador de la tienda es obligatorio.' })
  @MaxLength(100)
  tenantSlug: string;
}

import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateBranchDto {
  @IsNotEmpty({ message: 'El nombre de la sucursal es obligatorio' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'La dirección de la sucursal es obligatoria' })
  @IsString()
  address: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

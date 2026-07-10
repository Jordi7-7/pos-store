import { IsString, IsNotEmpty, IsOptional, IsArray, IsUUID } from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  imageIds?: string[];
}

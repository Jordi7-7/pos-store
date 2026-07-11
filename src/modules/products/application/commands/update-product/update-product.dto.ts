import { IsString, IsNotEmpty, IsOptional, IsArray, IsUUID } from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  imageIds?: string[];
}

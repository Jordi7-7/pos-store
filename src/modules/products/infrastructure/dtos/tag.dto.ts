import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la etiqueta es obligatorio.' })
  @MaxLength(100)
  name: string;
}

export class UpdateVariantTagsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  tagIds: string[];
}

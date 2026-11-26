import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class ReorderAttributeValuesDto {
  /** Todas las opciones del atributo, en el orden deseado. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  valueIds: string[];
}

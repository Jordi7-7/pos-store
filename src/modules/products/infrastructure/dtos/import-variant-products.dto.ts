import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

/** Atributos que admite una fila (p. ej. las cuatro piezas de color de una mochila y el cierre). La web tiene el mismo tope. */
export const MAX_ATTRIBUTES_PER_ROW = 5;

export class ImportAttributeDto {
  @IsString()
  name: string;

  @IsString()
  value: string;
}

/** Una fila del archivo. Los textos vacíos llegan como cadena vacía y los números vacíos como `null`; lo que falte lo señala el informe por fila. */
export class ImportVariantRowDto {
  @IsInt()
  @Min(1)
  row: number;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  baseSku?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsArray()
  @ArrayMaxSize(MAX_ATTRIBUTES_PER_ROW)
  @ValidateNested({ each: true })
  @Type(() => ImportAttributeDto)
  @IsOptional()
  attributes?: ImportAttributeDto[];

  @IsString()
  sku: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsNumber()
  @IsOptional()
  purchasePrice?: number | null;

  @IsNumber()
  @IsOptional()
  salePrice?: number | null;

  @IsNumber()
  @IsOptional()
  wholesalePrice?: number | null;

  @IsNumber()
  @IsOptional()
  quantity?: number | null;
}

export class ImportVariantProductsDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  /** `true` valida y cuenta lo que se crearía, sin escribir nada. */
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportVariantRowDto)
  rows: ImportVariantRowDto[];
}

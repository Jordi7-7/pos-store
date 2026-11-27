import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

/** Fotos por tanda en la subida masiva. La web tiene el mismo tope. */
export const MAX_IMAGE_FILES = 200;

export class MatchImageFilesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMAGE_FILES)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(255, { each: true })
  fileNames: string[];
}

export class ImageAssignmentDto {
  @IsUUID()
  imageId: string;

  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsUUID()
  @IsOptional()
  variantId?: string;
}

export class AssignProductImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMAGE_FILES)
  @ValidateNested({ each: true })
  @Type(() => ImageAssignmentDto)
  items: ImageAssignmentDto[];
}

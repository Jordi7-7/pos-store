import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Las URLs de buscadores de imágenes y las firmadas (S3/R2) superan con facilidad los 2048. */
const MAX_URL_LENGTH = 8192;

export class PresignedUrlQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contentType: string;
}

export class ListImagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class RegisterImageDto {
  @IsString()
  @IsNotEmpty({ message: 'url is required' })
  @MaxLength(MAX_URL_LENGTH)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UploadImageByUrlDto {
  @IsString()
  @IsNotEmpty({ message: 'url is required' })
  @MaxLength(MAX_URL_LENGTH)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ALLOWED_IMAGE_TYPES } from './safe-image-fetcher';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.configService.get<string>('AWS_REGION') || 'auto';
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME') || 'pos-store';

    this.s3Client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });
  }

  async getUploadPresignedUrl(
    tenantId: string,
    filename: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; fileUrl: string }> {
    this.assertAllowedContentType(contentType);
    const key = this.buildKey(tenantId, filename);

    this.logger.log(`Generating S3/R2 presigned upload URL for Key: ${key}`);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    // Generate URL that expires in 5 minutes (300 seconds)
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 300 });
    
    // Construct the public URL of the uploaded S3/R2 asset
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    
    // If a public download domain (like Cloudflare R2 public subdomain or custom CDN domain) is set, use it.
    // Otherwise, default to standard S3 or endpoint path style.
    const publicUrl = this.configService.get<string>('AWS_S3_PUBLIC_URL');
    const fileUrl = publicUrl
      ? `${publicUrl}/${key}`
      : (endpoint 
          ? `${endpoint}/${this.bucketName}/${key}`
          : `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`);

    return { uploadUrl, fileUrl };
  }

  async deleteFile(fileUrlOrKey: string): Promise<void> {
    try {
      this.logger.log(`Attempting to delete S3/R2 asset: ${fileUrlOrKey}`);
      let key = fileUrlOrKey;

      if (fileUrlOrKey.startsWith('http://') || fileUrlOrKey.startsWith('https://')) {
        const urlObj = new URL(fileUrlOrKey);
        key = urlObj.pathname;

        if (key.startsWith('/')) {
          key = key.substring(1);
        }

        // If URL contains the bucket name (path-style endpoint usage), strip it
        const bucketName = this.bucketName;
        if (key.startsWith(`${bucketName}/`)) {
          key = key.substring(bucketName.length + 1);
        }
      } else {
        if (key.startsWith('/')) {
          key = key.substring(1);
        }
      }

      this.logger.log(`Resolved S3/R2 object Key to delete: ${key}`);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted S3/R2 asset for Key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete S3/R2 asset for ${fileUrlOrKey}:`, error);
      throw error;
    }
  }


  async uploadFileBuffer(
    tenantId: string,
    filename: string,
    contentType: string,
    buffer: Buffer,
  ): Promise<string> {
    this.assertAllowedContentType(contentType);
    const key = this.buildKey(tenantId, filename);

    this.logger.log(`Uploading S3/R2 asset buffer for Key: ${key}`);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
      Body: buffer,
    });

    await this.s3Client.send(command);

    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const publicUrl = this.configService.get<string>('AWS_S3_PUBLIC_URL');

    const fileUrl = publicUrl
      ? `${publicUrl}/${key}`
      : (endpoint 
          ? `${endpoint}/${this.bucketName}/${key}`
          : `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`);

    return fileUrl;
  }

  /** Prefijo de claves de un tenant (hash anónimo). Todo objeto del tenant vive bajo él. */
  tenantKeyPrefix(tenantId: string): string {
    return `${crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 16)}/`;
  }

  /** true si la URL o clave pertenece al espacio de almacenamiento del tenant. */
  belongsToTenant(tenantId: string, urlOrKey: string): boolean {
    const key = this.cleanUrl(urlOrKey);
    return !key.includes('..') && key.startsWith(this.tenantKeyPrefix(tenantId));
  }

  /** Lanza 403 si la clave no pertenece al tenant (evita registrar/borrar objetos ajenos). */
  assertBelongsToTenant(tenantId: string, urlOrKey: string): void {
    if (!this.belongsToTenant(tenantId, urlOrKey)) {
      throw new AppException(
        ErrorCode.MediaNotOwned,
        'El archivo no pertenece a esta tienda.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private buildKey(tenantId: string, filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? 'file';
    const safeName =
      base
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^[-.]+/, '')
        .slice(-100) || 'file';
    return `${this.tenantKeyPrefix(tenantId)}products/${crypto.randomUUID()}-${safeName}`;
  }

  private assertAllowedContentType(contentType: string): void {
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      throw new AppException(
        ErrorCode.UnsupportedMediaType,
        'Tipo de archivo no permitido. Solo se aceptan imágenes JPEG, PNG, WebP, GIF o AVIF.',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
  }

  cleanUrl(url: string): string {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      try {
        const urlObj = new URL(url);
        let key = urlObj.pathname;
        if (key.startsWith('/')) {
          key = key.substring(1);
        }
        // If URL contains the bucket name (path-style endpoint usage), strip it
        const bucketName = this.bucketName;
        if (key.startsWith(`${bucketName}/`)) {
          key = key.substring(bucketName.length + 1);
        }
        return key;
      } catch (e) {
        // Fallback if URL parsing fails
      }
    }
    return url;
  }

  getFullUrl(key: string): string {
    if (!key) return key;
    const publicUrl = this.configService.get<string>('AWS_S3_PUBLIC_URL') || '';
    const cleanPublicUrl = publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl;
    const cleanPath = key.startsWith('/') ? key.slice(1) : key;
    return `${cleanPublicUrl}/${cleanPath}`;
  }
}




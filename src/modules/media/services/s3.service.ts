import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

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
    const fileUuid = crypto.randomUUID();
    const cleanFilename = filename.replace(/\s+/g, '-').toLowerCase();
    
    // Hash tenantId using SHA-256 and grab first 16 chars to keep S3 URL clean but anonymous
    const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 16);
    const key = `${tenantHash}/products/${fileUuid}-${cleanFilename}`;

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

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      this.logger.log(`Attempting to delete S3/R2 asset at URL: ${fileUrl}`);
      const urlObj = new URL(fileUrl);
      let key = urlObj.pathname;

      if (key.startsWith('/')) {
        key = key.substring(1);
      }

      // If URL contains the bucket name (path-style endpoint usage), strip it
      const bucketName = this.bucketName;
      if (key.startsWith(`${bucketName}/`)) {
        key = key.substring(bucketName.length + 1);
      }

      this.logger.log(`Resolved S3/R2 object Key to delete: ${key}`);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted S3/R2 asset for Key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete S3/R2 asset at ${fileUrl}:`, error);
      throw error;
    }
  }

  async uploadFileBuffer(
    tenantId: string,
    filename: string,
    contentType: string,
    buffer: Buffer,
  ): Promise<string> {
    const fileUuid = crypto.randomUUID();
    const cleanFilename = filename.replace(/\s+/g, '-').toLowerCase();
    const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 16);
    const key = `${tenantHash}/products/${fileUuid}-${cleanFilename}`;

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
}

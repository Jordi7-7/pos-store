import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UploadImageByUrlCommand } from './upload-image-by-url.command';
import { ProductImage } from '../../../../products/domain/entities/product-image.entity';
import { S3Service } from '../../../services/s3.service';
import { fetchRemoteImage } from '../../../services/safe-image-fetcher';

const DEFAULT_FILENAME = 'downloaded-image.jpg';
const DEFAULT_DESCRIPTION = 'Imagen arrastrada de internet';

@CommandHandler(UploadImageByUrlCommand)
export class UploadImageByUrlHandler implements ICommandHandler<UploadImageByUrlCommand> {
  private readonly logger = new Logger(UploadImageByUrlHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly s3Service: S3Service,
  ) {}

  async execute(command: UploadImageByUrlCommand): Promise<ProductImage> {
    const { tenantId, url, description } = command;
    this.logger.log(`Fetching remote image for Tenant ${tenantId}`);

    // Descarga segura: bloquea IPs privadas/metadatos, redirecciones, tipos no imagen y tamaños excesivos.
    const { buffer, contentType } = await fetchRemoteImage(url);

    const fileUrl = await this.s3Service.uploadFileBuffer(tenantId, this.filenameFrom(url), contentType, buffer);

    const image = new ProductImage();
    image.tenantId = tenantId;
    image.url = this.s3Service.cleanUrl(fileUrl);
    image.description = description || DEFAULT_DESCRIPTION;

    const saved = await this.entityManager.getRepository(ProductImage).save(image);
    this.logger.log(`Image uploaded by URL: ID ${saved.id} for Tenant ${tenantId}`);
    // Se vuelve a leer para devolver lo mismo que las lecturas: con la dirección pública y no con la clave guardada
    return this.entityManager.getRepository(ProductImage).findOneByOrFail({ id: saved.id });
  }

  private filenameFrom(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
      return lastSegment.includes('.') ? lastSegment : DEFAULT_FILENAME;
    } catch {
      return DEFAULT_FILENAME;
    }
  }
}

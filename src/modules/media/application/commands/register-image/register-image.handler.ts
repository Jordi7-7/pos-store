import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RegisterImageCommand } from './register-image.command';
import { ProductImage } from '../../../../products/domain/entities/product-image.entity';
import { S3Service } from '../../../services/s3.service';

@CommandHandler(RegisterImageCommand)
export class RegisterImageHandler implements ICommandHandler<RegisterImageCommand> {
  private readonly logger = new Logger(RegisterImageHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly s3Service: S3Service,
  ) {}

  async execute(command: RegisterImageCommand): Promise<ProductImage> {
    const { tenantId, url, description } = command;

    // Solo se pueden registrar objetos del propio tenant (evita apuntar a archivos ajenos)
    this.s3Service.assertBelongsToTenant(tenantId, url);

    const image = new ProductImage();
    image.tenantId = tenantId;
    image.url = this.s3Service.cleanUrl(url);
    image.description = description;

    const saved = await this.entityManager.getRepository(ProductImage).save(image);
    this.logger.log(`Image registered: ID ${saved.id} for Tenant ${tenantId}`);
    return saved;
  }
}

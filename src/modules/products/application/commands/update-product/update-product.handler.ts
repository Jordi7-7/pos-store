import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { UpdateProductCommand } from './update-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  private readonly logger = new Logger(UpdateProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateProductCommand): Promise<Product> {
    const { tenantId, id, name, description, imageIds, categoryId } = command;
    this.logger.log(`Updating product ID: ${id} for Tenant: ${tenantId}`);

    const productRepo = this.entityManager.getRepository(Product);
    const imageRepo = this.entityManager.getRepository(ProductImage);
    const categoryRepo = this.entityManager.getRepository(Category);

    const product = await productRepo.findOne({
      where: { id, tenantId },
      relations: { images: true },
    });

    if (!product) {
      this.logger.warn(`Product update failed: Product ID ${id} not found for Tenant ${tenantId}`);
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;

    // Update Category if provided
    if (categoryId !== undefined) {
      if (categoryId === null || categoryId === '') {
        product.categoryId = null;
      } else {
        const category = await categoryRepo.findOne({
          where: { id: categoryId, tenantId },
        });
        if (!category) {
          this.logger.warn(`Product update failed: Category ID ${categoryId} not found for Tenant ${tenantId}`);
          throw new NotFoundException(`Category with ID ${categoryId} not found`);
        }
        product.categoryId = categoryId;
      }
    }

    if (imageIds !== undefined) {
      if (imageIds.length > 0) {
        const images = await imageRepo.find({
          where: { id: In(imageIds), tenantId },
        });
        if (images.length !== imageIds.length) {
          this.logger.warn(`Product update failed: some parent image IDs from [${imageIds}] were not found for Tenant ${tenantId}`);
          throw new BadRequestException('Some product images were not found');
        }
        product.images = images;
      } else {
        product.images = [];
      }
    }

    const savedProduct = await productRepo.save(product);
    this.logger.log(`Product updated successfully: ID ${savedProduct.id}`);

    return savedProduct;
  }
}

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { CreateProductCommand } from './create-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';

@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand> {
  private readonly logger = new Logger(CreateProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateProductCommand): Promise<Product> {
    const { tenantId, name, description, variants } = command;
    this.logger.log(`Creating product: ${name} with ${variants.length} variant(s) for Tenant: ${tenantId}`);
    return this.entityManager.transaction(async (transactionalManager) => {
      const productRepo = transactionalManager.getRepository(Product);
      const attributeValueRepo = transactionalManager.getRepository(AttributeValue);

      const product = new Product();
      product.tenantId = tenantId;
      product.name = name;
      product.description = description;
      product.variants = [];

      for (const variantDto of variants) {
        const variant = new ProductVariant();
        variant.sku = variantDto.sku;
        variant.barcode = variantDto.barcode;
        variant.purchasePrice = variantDto.purchasePrice;
        variant.salePrice = variantDto.salePrice;
        variant.imageUrl = variantDto.imageUrl || null;

        const valueIds = variantDto.attributeValues.map((v: any) => v.attributeValueId);
        if (valueIds.length > 0) {
          const attributeValues = await attributeValueRepo.find({
            where: {
              id: In(valueIds),
              attribute: { tenantId },
            },
            relations: { attribute: true },
          });
          if (attributeValues.length !== valueIds.length) {
            this.logger.warn(`Product creation failed: some attribute values from IDs [${valueIds}] were not found or belong to another tenant`);
            throw new BadRequestException('Some variant attribute values were not found');
          }
          variant.attributeValues = attributeValues;
        } else {
          variant.attributeValues = [];
        }

        variant.stocks = [];
        if (variantDto.stocks) {
          for (const stockDto of variantDto.stocks) {
            const stock = new ProductStock();
            stock.branchId = stockDto.branchId;
            stock.quantity = stockDto.quantity;
            variant.stocks.push(stock);
          }
        }

        product.variants.push(variant);
      }

      const savedProduct = await productRepo.save(product);
      this.logger.log(`Product created successfully: ${savedProduct.name} (ID: ${savedProduct.id})`);
      return savedProduct;
    });
  }
}

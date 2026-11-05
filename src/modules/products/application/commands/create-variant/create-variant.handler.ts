import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { CreateVariantCommand } from './create-variant.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { recordInitialStock } from '../../services/initial-stock';
import { translatingSkuConflict } from '../../services/sku-conflict';
import { assertSkusDoNotShadowBaseSku } from '../../services/base-sku';
import { normalizeSku } from '../../../domain/sku';

@CommandHandler(CreateVariantCommand)
export class CreateVariantHandler implements ICommandHandler<CreateVariantCommand> {
  private readonly logger = new Logger(CreateVariantHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  execute(command: CreateVariantCommand): Promise<ProductVariant> {
    return translatingSkuConflict(() => this.run(command));
  }

  private async run(command: CreateVariantCommand): Promise<ProductVariant> {
    const { tenantId, productId } = command;
    const variantDto = { ...command.variantDto, sku: normalizeSku(command.variantDto.sku) };
    this.logger.log(`Creating variant for product ${productId} under Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const productRepo = transactionalManager.getRepository(Product);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const attributeValueRepo = transactionalManager.getRepository(AttributeValue);
      const imageRepo = transactionalManager.getRepository(ProductImage);

      // Validate product exists
      const product = await productRepo.findOne({
        where: { id: productId, tenantId },
        relations: { variants: { attributeValues: true } },
      });
      if (!product) {
        throw new AppException(ErrorCode.ProductNotFound, 'Producto no encontrado.', HttpStatus.NOT_FOUND, { productId });
      }

      // Validate SKU uniqueness per tenant
      const isSkuTaken = await variantRepo.findOne({
        where: { sku: variantDto.sku, tenantId },
      });
      if (isSkuTaken) {
        throw new AppException(ErrorCode.SkuTaken, `El SKU "${variantDto.sku}" ya está registrado en el sistema.`, HttpStatus.CONFLICT, { sku: variantDto.sku });
      }

      await assertSkusDoNotShadowBaseSku(transactionalManager, tenantId, [variantDto.sku], productId);

      // Validate no duplicate attribute combinations in existing product variants
      const valueIds = variantDto.attributeValues?.map((v) => v.attributeValueId) || [];
      const newCombinationKey = [...valueIds].sort().join(',');

      if (newCombinationKey) {
        for (const existingVariant of product.variants) {
          const existingKey = existingVariant.attributeValues
            ?.map((av) => av.id)
            .sort()
            .join(',') || '';
          if (existingKey === newCombinationKey) {
            throw new AppException(ErrorCode.DuplicateVariantCombination, 'Ya existe una variante con la misma combinación de atributos para este producto.', HttpStatus.CONFLICT);
          }
        }
      }

      // Create new variant
      const variant = new ProductVariant();
      variant.product = product;
      variant.sku = variantDto.sku;
      variant.barcode = variantDto.barcode || '';
      variant.purchasePrice = Number(variantDto.purchasePrice) || 0;
      variant.salePrice = Number(variantDto.salePrice) || 0;
      variant.wholesalePrice = variantDto.wholesalePrice !== undefined && variantDto.wholesalePrice !== null ? Number(variantDto.wholesalePrice) : null;
      variant.tenantId = tenantId;



      // Link variant images
      if (variantDto.imageIds && variantDto.imageIds.length > 0) {
        const varImages = await imageRepo.find({
          where: { id: In(variantDto.imageIds), tenantId },
        });
        variant.images = varImages;
      } else {
        variant.images = [];
      }

      // Link attribute values
      if (valueIds.length > 0) {
        const attributeValues = await attributeValueRepo.find({
          where: {
            id: In(valueIds),
            attribute: { tenantId },
          },
          relations: { attribute: true },
        });
        if (attributeValues.length !== valueIds.length) {
          throw new AppException(ErrorCode.AttributeValuesNotFound, 'Uno o más valores de atributo no existen.', HttpStatus.NOT_FOUND);
        }
        variant.attributeValues = attributeValues;
      } else {
        variant.attributeValues = [];
      }

      // Set initial stocks
      variant.stocks = [];
      if (variantDto.stocks) {
        for (const stockDto of variantDto.stocks) {
          const stock = new ProductStock();
          stock.branchId = stockDto.branchId;
          stock.quantity = Number(stockDto.quantity) || 0;
          stock.variant = variant;
          variant.stocks.push(stock);
        }
      }

      const savedVariant = await variantRepo.save(variant);

      await recordInitialStock(
        transactionalManager,
        tenantId,
        (savedVariant.stocks ?? []).map((stock) => ({
          branchId: stock.branchId,
          variantId: savedVariant.id,
          sku: savedVariant.sku,
          quantity: Number(stock.quantity),
          unitCost: Number(savedVariant.purchasePrice),
        })),
      );

      delete (savedVariant as any).product;
      if (savedVariant.stocks) {
        for (const stock of savedVariant.stocks) {
          delete (stock as any).variant;
        }
      }

      return savedVariant;
    });
  }
}

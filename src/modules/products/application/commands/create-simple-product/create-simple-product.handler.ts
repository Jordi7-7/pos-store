import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { CreateSimpleProductCommand } from './create-simple-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { ProductType } from '../../../domain/enums/product-type.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { recordInitialStock } from '../../services/initial-stock';
import { translatingSkuConflict } from '../../services/sku-conflict';
import { normalizeSku } from '../../../domain/sku';


@CommandHandler(CreateSimpleProductCommand)

export class CreateSimpleProductHandler implements ICommandHandler<CreateSimpleProductCommand> {
  private readonly logger = new Logger(CreateSimpleProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  execute(command: CreateSimpleProductCommand): Promise<Product> {
    return translatingSkuConflict(() => this.run(command));
  }

  private async run(command: CreateSimpleProductCommand): Promise<Product> {
    const {
      tenantId,
      name,
      description,
      barcode,
      purchasePrice,
      salePrice,
      wholesalePrice,
      categoryId,
      imageIds,
      stocks,
    } = command;
    const sku = normalizeSku(command.sku);

    this.logger.log(`Creating simple product: ${name} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const productRepo = transactionalManager.getRepository(Product);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const imageRepo = transactionalManager.getRepository(ProductImage);
      const categoryRepo = transactionalManager.getRepository(Category);
      const branchRepo = transactionalManager.getRepository(Branch);

      // Validate branch existence for stocks
      if (stocks && stocks.length > 0) {
        for (const stockDto of stocks) {
          const branchExists = await branchRepo.findOne({
            where: { id: stockDto.branchId, tenantId },
          });
          if (!branchExists) {
            throw new AppException(ErrorCode.BranchNotFound, `La sucursal con ID "${stockDto.branchId}" no existe o no pertenece al inquilino.`, HttpStatus.NOT_FOUND, { branchId: stockDto.branchId });
          }
        }
      }

      // Validate SKU uniqueness globally or per tenant (now per tenant)
      const isSkuTaken = await variantRepo.findOne({
        where: { sku, tenantId },
      });
      if (isSkuTaken) {
        throw new AppException(ErrorCode.SkuTaken, `El SKU "${sku}" ya está registrado en el sistema.`, HttpStatus.CONFLICT, { sku });
      }

      const product = new Product();
      product.tenantId = tenantId;
      product.name = name;
      product.description = description;
      product.type = ProductType.SIMPLE;
      product.baseSku = sku || null;

      // Link Category if provided
      if (categoryId) {
        const category = await categoryRepo.findOne({
          where: { id: categoryId, tenantId },
        });
        if (!category) {
          throw new AppException(ErrorCode.CategoryNotFound, 'Categoría no encontrada.', HttpStatus.NOT_FOUND, { categoryId });
        }
        product.categoryId = categoryId;
      } else {
        product.categoryId = null;
      }

      // Link parent product images
      if (imageIds && imageIds.length > 0) {
        const images = await imageRepo.find({
          where: { id: In(imageIds), tenantId },
        });
        if (images.length !== imageIds.length) {
          throw new AppException(ErrorCode.ImagesNotFound, 'Una o más imágenes del producto no existen.', HttpStatus.NOT_FOUND);
        }
        product.images = images;
      } else {
        product.images = [];
      }

      const savedProduct = await productRepo.save(product);

      // Create the single default variant for this simple product
      const variant = new ProductVariant();
      variant.product = savedProduct;
      variant.tenantId = tenantId;
      variant.sku = sku;
      variant.barcode = barcode || '';
      variant.purchasePrice = Number(purchasePrice) || 0;
      variant.salePrice = Number(salePrice) || 0;
      variant.wholesalePrice = wholesalePrice !== undefined && wholesalePrice !== null ? Number(wholesalePrice) : null;
      variant.attributeValues = [];
      variant.images = product.images; // Default variant shares the same images


      // Set initial stocks
      variant.stocks = [];
      if (stocks && stocks.length > 0) {
        for (const stockDto of stocks) {
          const stock = new ProductStock();
          stock.branchId = stockDto.branchId;
          stock.quantity = Number(stockDto.quantity) || 0;
          variant.stocks.push(stock);
        }
      }


      const savedVariant = await variantRepo.save(variant);

      await recordInitialStock(
        transactionalManager,
        tenantId,
        savedVariant.stocks.map((stock) => ({
          branchId: stock.branchId,
          variantId: savedVariant.id,
          sku: savedVariant.sku,
          quantity: Number(stock.quantity),
          unitCost: Number(savedVariant.purchasePrice),
        })),
      );

      if (savedVariant) {
        delete (savedVariant as any).product;
      }
      savedProduct.variants = [savedVariant];
      this.logger.log(`Simple product created successfully: ${savedProduct.name} (ID: ${savedProduct.id})`);

      return savedProduct;
    });
  }

}

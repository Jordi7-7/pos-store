import { HttpStatus, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { AssignProductImagesCommand, ImageAssignment } from './assign-product-images.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductType } from '../../../domain/enums/product-type.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

interface Link {
  ownerId: string;
  imageId: string;
}

export interface AssignProductImagesResult {
  assigned: number;
}

const unique = (values: Array<string | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

/**
 * Agrega fotos a productos y variantes sin quitar las que ya tienen; repetir la misma asignación no duplica nada. En un
 * producto simple la foto queda en el producto y en su variante, como al crearlo desde la pantalla. Todo o nada.
 */
@CommandHandler(AssignProductImagesCommand)
export class AssignProductImagesHandler implements ICommandHandler<AssignProductImagesCommand, AssignProductImagesResult> {
  private readonly logger = new Logger(AssignProductImagesHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute({ tenantId, items }: AssignProductImagesCommand): Promise<AssignProductImagesResult> {
    if (items.some((item) => Boolean(item.productId) === Boolean(item.variantId))) {
      throw new AppException(ErrorCode.ValidationFailed, 'Cada foto necesita un producto o una variante, no ambos.', HttpStatus.BAD_REQUEST);
    }
    this.logger.log(`Assigning ${items.length} image(s) for Tenant: ${tenantId}`);

    await this.entityManager.transaction(async (manager) => {
      const { productLinks, variantLinks } = await this.resolveLinks(manager, tenantId, items);
      await this.link(manager, 'product_image_mappings', 'product_id', productLinks);
      await this.link(manager, 'product_variant_image_mappings', 'product_variant_id', variantLinks);
    });
    return { assigned: items.length };
  }

  /** Comprueba que todo es de la tienda y traduce cada asignación a las filas que hay que crear. */
  private async resolveLinks(manager: EntityManager, tenantId: string, items: readonly ImageAssignment[]): Promise<{ productLinks: Link[]; variantLinks: Link[] }> {
    const imageIds = unique(items.map((item) => item.imageId));
    if ((await manager.getRepository(ProductImage).countBy({ tenantId, id: In(imageIds) })) !== imageIds.length) {
      throw new AppException(ErrorCode.ImagesNotFound, 'Una o más imágenes no existen.', HttpStatus.NOT_FOUND);
    }

    const variantIds = unique(items.map((item) => item.variantId));
    const chosen = variantIds.length > 0 ? await manager.getRepository(ProductVariant).findBy({ tenantId, id: In(variantIds) }) : [];
    const missingVariant = variantIds.find((id) => !chosen.some((variant) => variant.id === id));
    if (missingVariant) {
      throw new AppException(ErrorCode.VariantNotFound, `La variante con ID ${missingVariant} no existe.`, HttpStatus.NOT_FOUND, { variantId: missingVariant });
    }

    const productIds = unique([...items.map((item) => item.productId), ...chosen.map((variant) => variant.productId)]);
    const products = await manager.getRepository(Product).findBy({ tenantId, id: In(productIds) });
    const missingProduct = productIds.find((id) => !products.some((product) => product.id === id));
    if (missingProduct) {
      throw new AppException(ErrorCode.ProductNotFound, 'Producto no encontrado.', HttpStatus.NOT_FOUND, { productId: missingProduct });
    }

    const simpleIds = products.filter((product) => product.type === ProductType.SIMPLE).map((product) => product.id);
    const simpleVariants = simpleIds.length > 0 ? await manager.getRepository(ProductVariant).findBy({ tenantId, productId: In(simpleIds) }) : [];

    const productLinks: Link[] = [];
    const variantLinks: Link[] = [];
    for (const { imageId, productId, variantId } of items) {
      // Ya se comprobó que la variante existe, así que siempre hay un producto dueño
      const ownerProductId = productId ?? chosen.find((variant) => variant.id === variantId)?.productId ?? '';
      if (simpleIds.includes(ownerProductId)) {
        productLinks.push({ ownerId: ownerProductId, imageId });
        for (const variant of simpleVariants.filter((v) => v.productId === ownerProductId)) variantLinks.push({ ownerId: variant.id, imageId });
      } else if (variantId) {
        variantLinks.push({ ownerId: variantId, imageId });
      } else {
        productLinks.push({ ownerId: ownerProductId, imageId });
      }
    }
    return { productLinks, variantLinks };
  }

  private async link(manager: EntityManager, table: string, ownerColumn: string, links: readonly Link[]): Promise<void> {
    if (links.length === 0) return;
    await manager
      .createQueryBuilder()
      .insert()
      .into(table, [ownerColumn, 'product_image_id'])
      .values(links.map((link) => ({ [ownerColumn]: link.ownerId, product_image_id: link.imageId })))
      .orIgnore()
      .execute();
  }
}

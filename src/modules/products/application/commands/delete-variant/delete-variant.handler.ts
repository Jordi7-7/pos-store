import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DeleteVariantCommand } from './delete-variant.command';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { Product } from '../../../domain/entities/product.entity';

@CommandHandler(DeleteVariantCommand)
export class DeleteVariantHandler implements ICommandHandler<DeleteVariantCommand> {
  private readonly logger = new Logger(DeleteVariantHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: DeleteVariantCommand): Promise<void> {
    const { tenantId, variantId } = command;
    this.logger.log(`Soft-deleting variant ID: ${variantId} for Tenant: ${tenantId}`);

    const variantRepo = this.entityManager.getRepository(ProductVariant);
    const productRepo = this.entityManager.getRepository(Product);

    // 1. Find variant with stocks and product relationship
    const variant = await variantRepo.findOne({
      where: { id: variantId, tenantId },
      relations: { stocks: true, product: true },
    });

    if (!variant) {
      this.logger.warn(`Variant soft-deletion failed: Variant ID ${variantId} not found under Tenant ${tenantId}`);
      throw new NotFoundException(`Variante no encontrada.`);
    }

    // 2. Count active variants for this parent product
    const activeVariantsCount = await variantRepo.count({
      where: { productId: variant.productId, tenantId },
    });

    if (activeVariantsCount <= 1) {
      throw new BadRequestException(
        'No puedes eliminar la única variante de este producto. Si deseas retirar el artículo por completo, elimina el producto principal.',
      );
    }

    // 3. Verify variant has zero stock in all branches
    const hasNonZeroStock = (variant.stocks || []).some(
      (s) => Number(s.quantity) !== 0,
    );

    if (hasNonZeroStock) {
      throw new BadRequestException(
        'No se puede eliminar la variante porque tiene existencias activas o saldos negativos en inventario. Todas las cantidades deben estar en 0.',
      );
    }

    // 4. Soft remove variant (preserves sales, order items, and Kardex history)
    await variantRepo.softRemove(variant);
    this.logger.log(`Variant ID ${variantId} soft-deleted successfully`);
  }
}

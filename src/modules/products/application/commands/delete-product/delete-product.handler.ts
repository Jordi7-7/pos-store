import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DeleteProductCommand } from './delete-product.command';
import { Product } from '../../../domain/entities/product.entity';

@CommandHandler(DeleteProductCommand)
export class DeleteProductHandler implements ICommandHandler<DeleteProductCommand> {
  private readonly logger = new Logger(DeleteProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: DeleteProductCommand): Promise<void> {
    const { tenantId, id } = command;
    this.logger.log(`Soft-deleting product ID: ${id} for Tenant: ${tenantId}`);

    const productRepo = this.entityManager.getRepository(Product);

    const product = await productRepo.findOne({
      where: { id, tenantId },
      relations: { variants: { stocks: true } },
    });

    if (!product) {
      this.logger.warn(`Product soft-deletion failed: Product ID ${id} not found for Tenant ${tenantId}`);
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Validar que el producto no tenga existencias activas en ninguna variante
    const totalStock = product.variants.reduce(
      (sum, v) => sum + (v.stocks?.reduce((sSum, s) => sSum + s.quantity, 0) || 0),
      0,
    );

    if (totalStock > 0) {
      throw new BadRequestException(
        `No se puede eliminar el producto porque tiene stock disponible en inventario (${totalStock} pzs). Ajusta el stock a 0 primero.`,
      );
    }

    // TypeORM softRemove will cascade to variants due to cascade: true on the entity relation
    await productRepo.softRemove(product);
    this.logger.log(`Product ID ${id} and its variants soft-deleted successfully`);
  }
}

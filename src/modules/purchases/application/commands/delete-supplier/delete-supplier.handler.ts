import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DeleteSupplierCommand } from './delete-supplier.command';
import { Supplier } from '../../../domain/entities/supplier.entity';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';

@CommandHandler(DeleteSupplierCommand)
export class DeleteSupplierHandler implements ICommandHandler<DeleteSupplierCommand> {
  private readonly logger = new Logger(DeleteSupplierHandler.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
  ) {}

  async execute(command: DeleteSupplierCommand): Promise<{ message: string }> {
    const { tenantId, id } = command;

    const supplier = await this.supplierRepository.findOne({
      where: { id, tenantId },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    // Check if supplier has associated purchases
    const countPurchases = await this.purchaseOrderRepository.count({
      where: { tenantId, supplierId: id },
    });

    if (countPurchases > 0) {
      throw new BadRequestException('No se puede eliminar el proveedor porque tiene órdenes de compra asociadas.');
    }

    await this.supplierRepository.softRemove(supplier);
    this.logger.log(`Supplier soft-deleted: ${supplier.name} (${id})`);
    return { message: 'Proveedor eliminado exitosamente.' };
  }
}

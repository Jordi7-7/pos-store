import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger, HttpStatus } from '@nestjs/common';
import { DeleteSupplierCommand } from './delete-supplier.command';
import { Supplier } from '../../../domain/entities/supplier.entity';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

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
      throw new AppException(ErrorCode.SupplierNotFound, 'Proveedor no encontrado.', HttpStatus.NOT_FOUND, { id });
    }

    // Check if supplier has associated purchases
    const countPurchases = await this.purchaseOrderRepository.count({
      where: { tenantId, supplierId: id },
    });

    if (countPurchases > 0) {
      throw new AppException(ErrorCode.SupplierHasPurchases, 'No se puede eliminar el proveedor porque tiene órdenes de compra asociadas.', HttpStatus.CONFLICT);
    }

    await this.supplierRepository.softRemove(supplier);
    this.logger.log(`Supplier soft-deleted: ${supplier.name} (${id})`);
    return { message: 'Proveedor eliminado exitosamente.' };
  }
}

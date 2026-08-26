import { Controller, Post, Body, Get, Patch, Param } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { CreateSupplierDto } from '../../application/commands/create-supplier/create-supplier.dto';
import { CreateSupplierCommand } from '../../application/commands/create-supplier/create-supplier.command';
import { RegisterPurchaseDto } from '../../application/commands/register-purchase/register-purchase.dto';
import { RegisterPurchaseCommand } from '../../application/commands/register-purchase/register-purchase.command';
import { CancelPurchaseOrderCommand } from '../../application/commands/cancel-purchase-order/cancel-purchase-order.command';
import { GetSuppliersQuery } from '../../application/queries/get-suppliers/get-suppliers.query';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { ProductBatch } from '../../../products/domain/entities/product-batch.entity';
import { ProductVariant } from '../../../products/domain/entities/product-variant.entity';
import { ValidateImportPurchasesDto, ImportPurchasesDto } from '../../application/commands/import-purchases/import-purchases.dto';
import { ImportPurchasesCommand } from '../../application/commands/import-purchases/import-purchases.command';
import { ValidateImportPurchasesQuery } from '../../application/queries/validate-import-purchases/validate-import-purchases.query';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly entityManager: EntityManager,
  ) {}

  @Post('suppliers')
  async createSupplier(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.commandBus.execute(
      new CreateSupplierCommand(
        tenantId,
        dto.identityNumber,
        dto.name,
        dto.email,
        dto.phone,
        dto.address,
      ),
    );
  }

  @Get('suppliers')
  async findSuppliers(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetSuppliersQuery(tenantId));
  }

  @Post()
  async registerPurchase(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: RegisterPurchaseDto,
  ) {
    return this.commandBus.execute(
      new RegisterPurchaseCommand(
        tenantId,
        dto.supplierId,
        dto.branchId,
        dto.invoiceNumber || null,
        dto.items,
      ),
    );
  }

  @Get()
  async getPurchases(@CurrentUser('tenantId') tenantId: string) {
    const purchaseRepo = this.entityManager.getRepository(PurchaseOrder);
    const batchRepo = this.entityManager.getRepository(ProductBatch);

    const orders = await purchaseRepo.find({
      where: { tenantId },
      relations: {
        supplier: true,
        branch: true,
        items: {
          variant: { product: true },
        },
      },
      order: { createdAt: 'DESC' },
    });

    // Determine cancellability: order must be COMPLETED and all batches intact
    const result = await Promise.all(
      orders.map(async (order) => {
        if (order.status !== 'COMPLETED') {
          return { ...order, isCancellable: false };
        }

        const batches = await batchRepo.find({
          where: { purchaseOrderId: order.id },
        });

        const allIntact = batches.every(
          (b) => Number(b.remainingQuantity) === Number(b.initialQuantity),
        );

        return { ...order, isCancellable: allIntact };
      }),
    );

    return result;
  }

  @Patch(':id/cancel')
  async cancelPurchase(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') purchaseOrderId: string,
  ) {
    await this.commandBus.execute(
      new CancelPurchaseOrderCommand(tenantId, purchaseOrderId),
    );
    return { message: 'Purchase order cancelled successfully' };
  }

  @Post('validate-import')
  async validateImport(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ValidateImportPurchasesDto,
  ) {
    return this.queryBus.execute(
      new ValidateImportPurchasesQuery(tenantId, dto.items),
    );
  }

  @Post('import')
  async importPurchases(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ImportPurchasesDto,
  ) {
    return this.commandBus.execute(
      new ImportPurchasesCommand(tenantId, dto.branchId, dto.items),
    );
  }
}

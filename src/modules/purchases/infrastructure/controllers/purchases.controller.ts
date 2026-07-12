import { Controller, Post, Body, Get } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CreateSupplierDto } from '../../application/commands/create-supplier/create-supplier.dto';
import { CreateSupplierCommand } from '../../application/commands/create-supplier/create-supplier.command';
import { RegisterPurchaseDto } from '../../application/commands/register-purchase/register-purchase.dto';
import { RegisterPurchaseCommand } from '../../application/commands/register-purchase/register-purchase.command';
import { GetSuppliersQuery } from '../../application/queries/get-suppliers/get-suppliers.query';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';

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
        dto.invoiceNumber,
        dto.items,
      ),
    );
  }

  @Get()
  async getPurchases(@CurrentUser('tenantId') tenantId: string) {
    const repo = this.entityManager.getRepository(PurchaseOrder);
    return repo.find({
      where: { tenantId },
      relations: {
        supplier: true,
        branch: true,
        items: {
          variant: { product: true }
        }
      },
      order: { createdAt: 'DESC' },
    });
  }
}

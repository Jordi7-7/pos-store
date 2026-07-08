import { Controller, Post, Body } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CreateSupplierDto } from '../../application/commands/create-supplier/create-supplier.dto';
import { CreateSupplierCommand } from '../../application/commands/create-supplier/create-supplier.command';
import { RegisterPurchaseDto } from '../../application/commands/register-purchase/register-purchase.dto';
import { RegisterPurchaseCommand } from '../../application/commands/register-purchase/register-purchase.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly commandBus: CommandBus) {}

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
}

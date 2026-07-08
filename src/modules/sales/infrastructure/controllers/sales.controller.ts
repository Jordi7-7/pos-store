import { Controller, Post, Body } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ProcessSaleDto } from '../../application/commands/process-sale/process-sale.dto';
import { ProcessSaleCommand } from '../../application/commands/process-sale/process-sale.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';

@Controller('sales')
export class SalesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  async process(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ProcessSaleDto,
  ) {
    return this.commandBus.execute(
      new ProcessSaleCommand(
        tenantId,
        dto.branchId,
        dto.cashSessionId,
        dto.customerId,
        dto.items,
        dto.payments,
      ),
    );
  }
}

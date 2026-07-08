import { Controller, Post, Body, Param } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ProcessSaleDto } from '../../application/commands/process-sale/process-sale.dto';
import { ProcessSaleCommand } from '../../application/commands/process-sale/process-sale.command';
import { OpenCashSessionDto } from '../../application/commands/open-cash-session/open-cash-session.dto';
import { OpenCashSessionCommand } from '../../application/commands/open-cash-session/open-cash-session.command';
import { CloseCashSessionDto } from '../../application/commands/close-cash-session/close-cash-session.dto';
import { CloseCashSessionCommand } from '../../application/commands/close-cash-session/close-cash-session.command';
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

  @Post('cash-sessions/open')
  async openSession(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: OpenCashSessionDto,
  ) {
    return this.commandBus.execute(
      new OpenCashSessionCommand(
        tenantId,
        userId,
        dto.branchId,
        dto.openingBalance,
      ),
    );
  }

  @Post('cash-sessions/:id/close')
  async closeSession(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
  ) {
    return this.commandBus.execute(
      new CloseCashSessionCommand(
        tenantId,
        id,
        dto.closingBalance,
      ),
    );
  }
}

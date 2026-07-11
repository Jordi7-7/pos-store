import { Controller, Post, Body, Param, Get, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { ProcessSaleDto } from '../../application/commands/process-sale/process-sale.dto';
import { ProcessSaleCommand } from '../../application/commands/process-sale/process-sale.command';
import { OpenCashSessionDto } from '../../application/commands/open-cash-session/open-cash-session.dto';
import { OpenCashSessionCommand } from '../../application/commands/open-cash-session/open-cash-session.command';
import { CloseCashSessionDto } from '../../application/commands/close-cash-session/close-cash-session.dto';
import { CloseCashSessionCommand } from '../../application/commands/close-cash-session/close-cash-session.command';
import { RegisterExpenseDto } from '../../application/commands/register-expense/register-expense.dto';
import { RegisterExpenseCommand } from '../../application/commands/register-expense/register-expense.command';
import { ProcessRefundDto } from '../../application/commands/process-refund/process-refund.dto';
import { ProcessRefundCommand } from '../../application/commands/process-refund/process-refund.command';
import { GetSalesQuery } from '../../application/queries/get-sales/get-sales.query';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { CashSession } from '../../domain/entities/cash-session.entity';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly entityManager: EntityManager,
  ) {}

  @Get('cash-sessions/active')
  async getActiveSession(
    @CurrentUser('sub') userId: string,
    @Query('branchId') branchId?: string,
  ) {
    const whereClause: any = { userId, status: 'OPEN' };
    if (branchId) {
      whereClause.branchId = branchId;
    }
    const session = await this.entityManager.getRepository(CashSession).findOne({
      where: whereClause,
    });
    return session || null;
  }

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

  @Get()
  async findSales(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetSalesQuery(tenantId));
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

  @Post('expenses')
  async registerExpense(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: RegisterExpenseDto,
  ) {
    return this.commandBus.execute(
      new RegisterExpenseCommand(
        tenantId,
        dto.branchId,
        dto.description,
        dto.amount,
        dto.category,
        dto.cashSessionId,
      ),
    );
  }

  @Post('refunds')
  async processRefund(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ProcessRefundDto,
  ) {
    return this.commandBus.execute(
      new ProcessRefundCommand(
        tenantId,
        dto.branchId,
        dto.saleId,
        dto.cashSessionId,
        dto.reason,
        dto.items,
      ),
    );
  }
}

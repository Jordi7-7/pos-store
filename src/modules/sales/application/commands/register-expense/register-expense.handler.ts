import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RegisterExpenseCommand } from './register-expense.command';
import { Expense } from '../../../domain/entities/expense.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';

@CommandHandler(RegisterExpenseCommand)
export class RegisterExpenseHandler implements ICommandHandler<RegisterExpenseCommand> {
  private readonly logger = new Logger(RegisterExpenseHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: RegisterExpenseCommand): Promise<Expense> {
    const { tenantId, branchId, description, amount, category } = command;
    this.logger.log(`Registering expense: $${amount} (${category}) in Branch: ${branchId} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const branchRepo = transactionalManager.getRepository(Branch);
      const cashSessionRepo = transactionalManager.getRepository(CashSession);
      const expenseRepo = transactionalManager.getRepository(Expense);

      // 1. Verify branch exists and belongs to this tenant
      const branch = await branchRepo.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) {
        this.logger.warn(`Expense registration failed: Branch ID ${branchId} not found under Tenant ${tenantId}`);
        throw new NotFoundException(`Branch with ID ${branchId} not found`);
      }

      // 2. Verify there is an active open cash session at this branch
      const activeSession = await cashSessionRepo.findOne({
        where: {
          branchId,
          status: 'OPEN',
        },
      });
      if (!activeSession) {
        this.logger.warn(`Expense registration failed: no active open cash session found in Branch ${branchId}`);
        throw new BadRequestException('Expense cannot be registered because there is no active open cash session in this branch.');
      }

      const expense = new Expense();
      expense.tenantId = tenantId;
      expense.branchId = branchId;
      expense.description = description;
      expense.amount = amount;
      expense.category = category;

      const savedExpense = await expenseRepo.save(expense);
      this.logger.log(`Expense registered successfully: ID ${savedExpense.id}`);

      return savedExpense;
    });
  }
}

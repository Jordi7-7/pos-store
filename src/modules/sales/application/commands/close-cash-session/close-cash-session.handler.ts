import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CloseCashSessionCommand } from './close-cash-session.command';
import { CashSession } from '../../../domain/entities/cash-session.entity';

@CommandHandler(CloseCashSessionCommand)
export class CloseCashSessionHandler implements ICommandHandler<CloseCashSessionCommand> {
  private readonly logger = new Logger(CloseCashSessionHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CloseCashSessionCommand): Promise<CashSession> {
    const { tenantId, id, closingBalance } = command;
    this.logger.log(`Closing cash session ID: ${id} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const cashSessionRepo = transactionalManager.getRepository(CashSession);

      // Verify cash session exists, is open, and belongs to caller's tenant
      const session = await cashSessionRepo.findOne({
        where: {
          id,
          status: 'OPEN',
          branch: { tenantId },
        },
        relations: { branch: true },
      });

      if (!session) {
        this.logger.warn(`Cash session closure failed: active cash session ID ${id} not found or belongs to another tenant`);
        throw new NotFoundException(`Active cash session with ID ${id} not found`);
      }

      session.closingBalance = closingBalance;
      session.status = 'CLOSED';
      session.closedAt = new Date();

      const savedSession = await cashSessionRepo.save(session);
      this.logger.log(`Cash session ID ${id} closed successfully`);

      return savedSession;
    });
  }
}

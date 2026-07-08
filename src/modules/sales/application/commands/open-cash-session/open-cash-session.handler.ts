import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OpenCashSessionCommand } from './open-cash-session.command';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';

@CommandHandler(OpenCashSessionCommand)
export class OpenCashSessionHandler implements ICommandHandler<OpenCashSessionCommand> {
  private readonly logger = new Logger(OpenCashSessionHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: OpenCashSessionCommand): Promise<CashSession> {
    const { tenantId, userId, branchId, openingBalance } = command;
    this.logger.log(`Opening cash session for User: ${userId} in Branch: ${branchId} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const branchRepo = transactionalManager.getRepository(Branch);
      const cashSessionRepo = transactionalManager.getRepository(CashSession);

      // 1. Verify branch exists and belongs to this tenant
      const branch = await branchRepo.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) {
        this.logger.warn(`Cash session opening failed: Branch ID ${branchId} not found under Tenant ${tenantId}`);
        throw new NotFoundException(`Branch with ID ${branchId} not found`);
      }

      // 2. Ensure user doesn't already have an open cash session
      const activeSession = await cashSessionRepo.findOne({
        where: {
          userId,
          status: 'OPEN',
        },
      });
      if (activeSession) {
        this.logger.warn(`Cash session opening failed: User ${userId} already has an active open cash session (ID: ${activeSession.id})`);
        throw new BadRequestException('You already have an active open cash session. Please close it first.');
      }

      const session = new CashSession();
      session.branchId = branchId;
      session.userId = userId;
      session.openingBalance = openingBalance;
      session.status = 'OPEN';
      session.openedAt = new Date();
      session.closingBalance = null;
      session.closedAt = null;

      const savedSession = await cashSessionRepo.save(session);
      this.logger.log(`Cash session opened successfully: ID ${savedSession.id}`);

      return savedSession;
    });
  }
}

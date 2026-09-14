import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OpenCashSessionCommand } from './open-cash-session.command';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { CashRegister } from '../../../domain/entities/cash-register.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

@CommandHandler(OpenCashSessionCommand)
export class OpenCashSessionHandler implements ICommandHandler<OpenCashSessionCommand> {
  private readonly logger = new Logger(OpenCashSessionHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: OpenCashSessionCommand): Promise<CashSession> {
    const { tenantId, userId, branchId, openingBalance, cashRegisterId } = command;
    this.logger.log(`Opening cash session for User: ${userId} in Branch: ${branchId} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const branchRepo = transactionalManager.getRepository(Branch);
      const cashSessionRepo = transactionalManager.getRepository(CashSession);
      const registerRepo = transactionalManager.getRepository(CashRegister);

      // 1. Verify branch exists and belongs to this tenant
      const branch = await branchRepo.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) {
        this.logger.warn(`Cash session opening failed: Branch ID ${branchId} not found under Tenant ${tenantId}`);
        throw new NotFoundException(`Branch with ID ${branchId} not found`);
      }

      // 1.1 Verify user permissions and assignment to this branch
      const userRepo = transactionalManager.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: userId, tenantId },
        relations: { branches: true, cashRegisters: true },
      });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const isOwner = user.role === UserRole.OWNER;

      // Check branch authorization
      const assignedBranchIds = (user.branches || []).map((b) => b.id);
      if (!isOwner) {
        if (assignedBranchIds.length === 0) {
          this.logger.warn(`User ${userId} has no assigned branches`);
          throw new ForbiddenException('No tienes ninguna sucursal asignada. Contacta a un administrador.');
        }
        if (!assignedBranchIds.includes(branchId)) {
          this.logger.warn(`User ${userId} attempted to open cash in unauthorized branch ${branchId}`);
          throw new ForbiddenException('No tienes autorización para abrir caja en esta sucursal.');
        }
      }

      // 2. Resolve CashRegister
      const register = await registerRepo.findOne({
        where: { id: cashRegisterId, branchId, tenantId },
      });
      if (!register) {
        throw new NotFoundException('La caja registradora seleccionada no existe en esta sucursal.');
      }

      // 2.1 Check cash register authorization for non-owner users
      if (!isOwner) {
        const assignedRegisterIds = (user.cashRegisters || []).map((cr) => cr.id);
        if (assignedRegisterIds.length === 0) {
          this.logger.warn(`User ${userId} attempted to open cash register without any assigned registers`);
          throw new ForbiddenException('No tienes ninguna caja registradora asignada para operar. Contacta a un administrador.');
        }
        if (!assignedRegisterIds.includes(register.id)) {
          this.logger.warn(`User ${userId} attempted to open unauthorized cash register ${register.id}`);
          throw new ForbiddenException(`No tienes autorización para operar en la ${register.name}.`);
        }
      }

      // 3. Ensure this specific register doesn't already have an open session
      const registerActiveSession = await cashSessionRepo.findOne({
        where: {
          cashRegisterId: register.id,
          status: 'OPEN',
        },
        relations: { user: true },
      });
      if (registerActiveSession) {
        const openedByName = registerActiveSession.user?.name || 'otro usuario';
        this.logger.warn(`Cash session opening failed: Register ${register.id} already has an active open cash session by User ${registerActiveSession.userId}`);
        throw new BadRequestException(`La ${register.name} ya tiene un turno abierto (por ${openedByName}). Debes cerrar ese turno o seleccionar otra caja.`);
      }

      // 4. Ensure this user does not already have an open session elsewhere
      const userActiveSession = await cashSessionRepo.findOne({
        where: {
          userId,
          status: 'OPEN',
        },
        relations: { cashRegister: true, branch: true },
      });
      if (userActiveSession) {
        throw new BadRequestException(`Ya tienes un turno de caja abierto en ${userActiveSession.branch?.name || 'otra sucursal'} (${userActiveSession.cashRegister?.name || 'Caja'}). Ciérralo antes de abrir una nueva.`);
      }

      const session = new CashSession();
      session.branchId = branchId;
      session.userId = userId;
      session.cashRegisterId = register.id;
      session.openingBalance = openingBalance;
      session.status = 'OPEN';
      session.openedAt = new Date();
      session.closingBalance = null;
      session.closedAt = null;

      const savedSession = await cashSessionRepo.save(session);
      this.logger.log(`Cash session opened successfully: ID ${savedSession.id} on register ${register.code}`);

      return savedSession;
    });
  }
}

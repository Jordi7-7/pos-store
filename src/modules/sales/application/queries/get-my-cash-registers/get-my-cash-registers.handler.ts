import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetMyCashRegistersQuery } from './get-my-cash-registers.query';
import { CashRegister } from '../../../domain/entities/cash-register.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

export interface MyCashRegisterDto {
  id: string;
  code: number;
  name: string;
  branchId: string;
  branchName: string;
  isOpen: boolean;
}

@QueryHandler(GetMyCashRegistersQuery)
export class GetMyCashRegistersHandler implements IQueryHandler<GetMyCashRegistersQuery> {
  private readonly logger = new Logger(GetMyCashRegistersHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetMyCashRegistersQuery): Promise<MyCashRegisterDto[]> {
    const { tenantId, userId, userRole, branchId } = query;
    this.logger.log(`Fetching cash registers for User: ${userId} (Role: ${userRole}), Branch: ${branchId || 'ALL'}, Tenant: ${tenantId}`);

    const registerRepo = this.entityManager.getRepository(CashRegister);
    const qb = registerRepo
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.branch', 'branch')
      .where('cr.tenantId = :tenantId', { tenantId })
      .andWhere('cr.isActive = true')
      .orderBy('cr.code', 'ASC');

    if (branchId && branchId !== 'null' && branchId !== 'undefined') {
      qb.andWhere('cr.branchId = :branchId', { branchId });
    }

    const isOwner = String(userRole).toUpperCase() === 'OWNER';

    // Si no es OWNER, filtrar estrictamente por las cajas asignadas al usuario
    if (!isOwner) {
      const user = await this.entityManager.findOne(User, {
        where: { id: userId, tenantId },
        relations: { cashRegisters: true },
      });
      const assignedIds = (user?.cashRegisters || []).map((cr) => cr.id);
      if (assignedIds.length === 0) {
        this.logger.warn(`User ${userId} has no assigned cash registers in tenant ${tenantId}`);
        return [];
      }
      qb.andWhere('cr.id IN (:...assignedIds)', { assignedIds });
    }

    const registers = await qb.getMany();
    this.logger.log(`Found ${registers.length} active cash register(s) for User ${userId}`);
    if (registers.length === 0) {
      return [];
    }

    // Consultar estado de sesión abierta
    const sessionRepo = this.entityManager.getRepository(CashSession);
    const openSessions = await sessionRepo.find({
      where: {
        status: 'OPEN',
        branch: { tenantId },
      },
      select: { id: true, cashRegisterId: true },
    });

    const openRegisterIds = new Set(openSessions.map((s) => s.cashRegisterId).filter(Boolean));

    return registers.map((reg) => ({
      id: reg.id,
      code: reg.code,
      name: reg.name,
      branchId: reg.branchId,
      branchName: reg.branch?.name || '',
      isOpen: openRegisterIds.has(reg.id),
    }));
  }
}

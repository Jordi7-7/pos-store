import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetCashRegistersQuery } from './get-cash-registers.query';
import { CashRegister } from '../../../domain/entities/cash-register.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';
import { APP_PERMISSIONS } from '../../../../../common/enums/permissions.enum';

export interface CashRegisterResponseDto {
  id: string;
  code: number;
  name: string;
  branchId: string;
  branchName: string;
  nextInvoiceNumber: number;
  isActive: boolean;
  isOpen: boolean;
  activeSession: {
    id: string;
    userId: string;
    userName: string;
    openedAt: Date;
    openingBalance: number;
  } | null;
  assignedUserIds: string[];
}

@QueryHandler(GetCashRegistersQuery)
export class GetCashRegistersHandler implements IQueryHandler<GetCashRegistersQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetCashRegistersQuery): Promise<CashRegisterResponseDto[]> {
    const { tenantId, branchId } = query;

    const registerRepo = this.entityManager.getRepository(CashRegister);
    const qb = registerRepo
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.branch', 'branch')
      .leftJoinAndSelect('cr.assignedUsers', 'assignedUsers')
      .where('cr.tenantId = :tenantId', { tenantId })
      .orderBy('cr.code', 'ASC');

    if (branchId) {
      qb.andWhere('cr.branchId = :branchId', { branchId });
    }

    const registers = await qb.getMany();

    // Consultar sesiones activas para reflejar estado abierto en tiempo real
    const sessionRepo = this.entityManager.getRepository(CashSession);
    const openSessions = await sessionRepo.find({
      where: {
        status: 'OPEN',
        branch: { tenantId },
      },
      relations: { user: true },
    });

    const sessionByRegisterId = new Map<string, CashSession>();
    openSessions.forEach((s) => {
      if (s.cashRegisterId) {
        sessionByRegisterId.set(s.cashRegisterId, s);
      }
    });

    return registers.map((reg) => {
      const activeSession = sessionByRegisterId.get(reg.id);
      return {
        id: reg.id,
        code: reg.code,
        name: reg.name,
        branchId: reg.branchId,
        branchName: reg.branch?.name || '',
        nextInvoiceNumber: reg.nextInvoiceNumber,
        isActive: reg.isActive,
        isOpen: !!activeSession,
        activeSession: activeSession
          ? {
              id: activeSession.id,
              userId: activeSession.userId,
              userName: activeSession.user?.name || '',
              openedAt: activeSession.openedAt,
              openingBalance: activeSession.openingBalance,
            }
          : null,
        assignedUserIds: (reg.assignedUsers || []).map((u: any) => u.id),
      };
    });
  }
}

import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, In } from 'typeorm';
import { Logger } from '@nestjs/common';
import { GetActiveCashSessionQuery } from './get-active-cash-session.query';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

export interface ActiveCashSessionResponseDto {
  id: string;
  status: string;
  branchId: string;
  cashRegisterId: string;
  cashRegisterName: string;
  openedAt: Date;
  openingBalance: number;
  openedByName: string;
}

@QueryHandler(GetActiveCashSessionQuery)
export class GetActiveCashSessionHandler implements IQueryHandler<GetActiveCashSessionQuery> {
  private readonly logger = new Logger(GetActiveCashSessionHandler.name);

  constructor(
    @InjectRepository(CashSession)
    private readonly cashSessionRepo: Repository<CashSession>,
    private readonly entityManager: EntityManager,
  ) {}

  async execute(query: GetActiveCashSessionQuery): Promise<ActiveCashSessionResponseDto | null> {
    const { tenantId, userId, userRole, branchId, cashRegisterId } = query;
    const isOwner = userRole === UserRole.OWNER;

    // Criterios base: sesión abierta dentro del tenant
    const where: any = {
      status: 'OPEN',
      branch: { tenantId },
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (cashRegisterId) {
      where.cashRegisterId = cashRegisterId;
    }

    // Si NO es OWNER, se restringe estrictamente por las cajas y sucursales asignadas
    if (!isOwner) {
      const user = await this.entityManager.findOne(User, {
        where: { id: userId, tenantId },
        relations: { branches: true, cashRegisters: true },
      });

      if (!user) return null;

      // 1. Validar restricción de sucursal: si no tiene sucursales asignadas o la solicitada no coincide, retornar null
      const assignedBranchIds = (user.branches || []).map((b) => b.id);
      if (assignedBranchIds.length === 0) {
        return null;
      }
      if (branchId && !assignedBranchIds.includes(branchId)) {
        return null; // Sucursal no autorizada para este usuario
      }
      if (!branchId) {
        where.branchId = In(assignedBranchIds);
      }

      // 2. Validar restricción de cajas: si no tiene cajas asignadas, retornar null
      const assignedRegisterIds = (user.cashRegisters || []).map((cr) => cr.id);
      if (assignedRegisterIds.length === 0) {
        return null; // Usuario sin cajas autorizadas
      }
      if (cashRegisterId) {
        if (!assignedRegisterIds.includes(cashRegisterId)) {
          return null; // Caja solicitada no autorizada para este usuario
        }
      } else {
        where.cashRegisterId = In(assignedRegisterIds);
      }
    }

    // Una sola consulta limpia y directa a la base de datos
    const session = await this.cashSessionRepo.findOne({
      where,
      relations: { user: true, branch: true, cashRegister: true },
      order: { openedAt: 'DESC' },
    });

    if (!session) return null;

    return {
      id: session.id,
      status: session.status,
      branchId: session.branchId,
      cashRegisterId: session.cashRegisterId,
      cashRegisterName: session.cashRegister.name,
      openedAt: session.openedAt,
      openingBalance: Number(session.openingBalance),
      openedByName: session.user.name,
    };
  }
}


import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetCashSessionsQuery } from './get-cash-sessions.query';
import { UserRole } from '../../../../users/enums/user-role.enum';

export interface CashSessionListItemDto {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  difference: number | null;
  branch: {
    id: string;
    name: string;
  } | null;
  cashRegister: {
    id: string;
    name: string;
    code: number;
  } | null;
  totalSales: number;
}

@QueryHandler(GetCashSessionsQuery)
export class GetCashSessionsHandler implements IQueryHandler<GetCashSessionsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetCashSessionsQuery): Promise<CashSessionListItemDto[]> {
    const { tenantId, branchId, userId, userRole } = query;

    const isOwner = userRole === UserRole.OWNER;

    if (!isOwner && !branchId) {
      throw new BadRequestException('Debes seleccionar una sucursal para consultar las sesiones de caja.');
    }

    if (branchId && !isOwner) {
      const user = await this.entityManager.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [userId],
      );
      const userBranchIds = (user || []).map((r: any) => r.branch_id);

      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException('No tienes permisos para consultar sesiones de caja en la sucursal seleccionada.');
      }
    }

    const params: any[] = [tenantId];
    let branchFilterSql = '';

    if (branchId) {
      params.push(branchId);
      branchFilterSql = `AND cs.branch_id = $${params.length}`;
    }

    const rawRows = await this.entityManager.query(
      `
      SELECT 
        cs.id AS "id",
        cs.status AS "status",
        cs.opened_at AS "openedAt",
        cs.closed_at AS "closedAt",
        cs.opening_balance AS "openingBalance",
        cs.closing_balance AS "closingBalance",
        cs.expected_balance AS "expectedBalance",
        cs.difference AS "difference",
        b.id AS "branchId",
        b.name AS "branchName",
        cr.id AS "cashRegisterId",
        cr.name AS "cashRegisterName",
        cr.code AS "cashRegisterCode",
        GREATEST(COALESCE(sales_summary.gross_sales, 0) - COALESCE(refunds_summary.session_refunds, 0), 0) AS "totalSales"
      FROM cash_sessions cs
      INNER JOIN branches b ON b.id = cs.branch_id
      LEFT JOIN cash_registers cr ON cr.id = cs.cash_register_id
      LEFT JOIN (
        SELECT 
          s.cash_session_id,
          SUM(s.total) AS gross_sales
        FROM sales s
        WHERE s.tenant_id = $1
          AND s.deleted_at IS NULL
        GROUP BY s.cash_session_id
      ) sales_summary ON sales_summary.cash_session_id = cs.id
      LEFT JOIN (
        SELECT 
          r.cash_session_id,
          SUM(r.total_refunded) AS session_refunds
        FROM refunds r
        WHERE r.tenant_id = $1
          AND r.deleted_at IS NULL
        GROUP BY r.cash_session_id
      ) refunds_summary ON refunds_summary.cash_session_id = cs.id
      WHERE b.tenant_id = $1
        AND cs.deleted_at IS NULL
        ${branchFilterSql}
      ORDER BY cs.opened_at DESC
      LIMIT 100
      `,
      params,
    );

    return rawRows.map((row: any) => ({
      id: row.id,
      status: row.status,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      openingBalance: Number(row.openingBalance || 0),
      closingBalance: row.closingBalance !== null ? Number(row.closingBalance) : null,
      expectedBalance: row.expectedBalance !== null ? Number(row.expectedBalance) : null,
      difference: row.difference !== null ? Number(row.difference) : null,
      branch: row.branchId
        ? {
            id: row.branchId,
            name: row.branchName,
          }
        : null,
      cashRegister: row.cashRegisterId
        ? {
            id: row.cashRegisterId,
            name: row.cashRegisterName,
            code: row.cashRegisterCode,
          }
        : null,
      totalSales: Number(row.totalSales || 0),
    }));
  }
}

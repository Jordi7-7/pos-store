import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetCashSessionsQuery } from './get-cash-sessions.query';
import { CashSessionListItemDto, CashSessionRow, toCashSessionListItem } from './cash-session-list-item';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';
import { SqlParams } from '../../../../../common/utils/sql-params';

export type { CashSessionListItemDto } from './cash-session-list-item';

const MAX_SESSIONS = 100;

@QueryHandler(GetCashSessionsQuery)
export class GetCashSessionsHandler implements IQueryHandler<GetCashSessionsQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetCashSessionsQuery): Promise<CashSessionListItemDto[]> {
    const { tenantId, branchId, userId, isOwner } = query;

    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      isOwner,
      branchId,
      actionDescription: 'consultar las sesiones de caja',
    });

    const rows = await this.findLatestSessions(tenantId, branchId);
    return rows.map(toCashSessionListItem);
  }

  /**
   * Las 100 sesiones más recientes; las ventas y devoluciones se suman solo para esas
   * sesiones (no se agrupa todo el historial del tenant).
   */
  private findLatestSessions(tenantId: string, branchId?: string): Promise<CashSessionRow[]> {
    const params = new SqlParams();
    const tenant = params.add(tenantId);
    const branchFilter = branchId ? `AND cs.branch_id = ${params.add(branchId)}` : '';

    return this.entityManager.query<CashSessionRow[]>(
      `
      WITH latest AS (
        SELECT cs.*
        FROM cash_sessions cs
        INNER JOIN branches b ON b.id = cs.branch_id
        WHERE b.tenant_id = ${tenant}
          AND cs.deleted_at IS NULL
          ${branchFilter}
        ORDER BY cs.opened_at DESC
        LIMIT ${MAX_SESSIONS}
      )
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
        b.address AS "branchAddress",
        cr.id AS "cashRegisterId",
        cr.name AS "cashRegisterName",
        cr.code AS "cashRegisterCode",
        u.id AS "userId",
        u.name AS "userName",
        GREATEST(
          COALESCE((
            SELECT SUM(s.total) FROM sales s
            WHERE s.cash_session_id = cs.id AND s.tenant_id = ${tenant} AND s.deleted_at IS NULL
          ), 0)
          - COALESCE((
            SELECT SUM(r.total_refunded) FROM refunds r
            WHERE r.cash_session_id = cs.id AND r.tenant_id = ${tenant} AND r.deleted_at IS NULL
          ), 0),
          0
        ) AS "totalSales"
      FROM latest cs
      INNER JOIN branches b ON b.id = cs.branch_id
      LEFT JOIN cash_registers cr ON cr.id = cs.cash_register_id
      LEFT JOIN users u ON u.id = cs.user_id
      ORDER BY cs.opened_at DESC
      `,
      params.values,
    );
  }
}

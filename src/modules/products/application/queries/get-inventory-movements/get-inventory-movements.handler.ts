import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';
import { GetInventoryMovementsQuery } from './get-inventory-movements.query';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { InventoryMovementHistoryItem, InventoryMovementHistoryPage } from '../../read-models/inventory-movement-history';
import { parseReportDates } from '../../../../reports/application/queries/parse-dates.helper';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch, visibleBranchIds } from '../../../../../common/security/branch-access.helper';
import { containsPattern } from '../../../../../common/utils/like';

/** Historial global de movimientos del tenant, de lo más reciente a lo más antiguo, con filtros. */
@QueryHandler(GetInventoryMovementsQuery)
export class GetInventoryMovementsHandler implements IQueryHandler<GetInventoryMovementsQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetInventoryMovementsQuery): Promise<InventoryMovementHistoryPage> {
    const { tenantId, userId, isOwner, filters } = query;
    const { page, limit, branchId, type, category, reason, variantId, search } = filters;

    // Si piden una sucursal concreta, el usuario debe tener acceso a ella; si no, ve solo las suyas.
    if (branchId) {
      await assertUserCanAccessBranch(this.entityManager, this.redisService, {
        userId,
        isOwner,
        branchId,
        actionDescription: 'consultar los movimientos de inventario',
      });
    }
    const allowedBranches = branchId ? null : await visibleBranchIds(this.entityManager, this.redisService, { userId, isOwner });
    if (allowedBranches && allowedBranches.length === 0) return emptyPage(page, limit);

    const { start, end } = await parseReportDates(this.entityManager, tenantId, filters.startDate, filters.endDate);

    const qb = this.entityManager
      .getRepository(InventoryMovement)
      .createQueryBuilder('movement')
      .innerJoin('movement.variant', 'variant')
      .innerJoin('variant.product', 'product')
      .leftJoin('movement.originBranch', 'originBranch')
      .leftJoin('movement.destinationBranch', 'destinationBranch')
      .leftJoin('movement.document', 'document')
      .leftJoin('document.user', 'author')
      .leftJoin('document.branch', 'documentOrigin')
      .leftJoin('document.destinationBranch', 'documentDestination')
      .select([
        'movement.id',
        'movement.createdAt',
        'movement.type',
        'movement.category',
        'movement.reason',
        'movement.quantity',
        'movement.unitCost',
        'movement.balanceAfter',
        'movement.variantId',
        'movement.purchaseOrderId',
        'variant.sku',
        'product.name',
        'originBranch.id',
        'originBranch.name',
        'destinationBranch.id',
        'destinationBranch.name',
        'document.id',
        'document.number',
        'document.comment',
        'document.kind',
        'document.destinationBranchId',
        'author.name',
        'documentOrigin.name',
        'documentDestination.name',
      ])
      .where('movement.tenantId = :tenantId', { tenantId })
      .andWhere('movement.createdAt BETWEEN :start AND :end', { start, end });

    if (branchId) {
      qb.andWhere('(movement.originBranchId = :branchId OR movement.destinationBranchId = :branchId)', { branchId });
    } else if (allowedBranches) {
      qb.andWhere('(movement.originBranchId IN (:...allowed) OR movement.destinationBranchId IN (:...allowed))', { allowed: allowedBranches });
    }
    if (type) qb.andWhere('movement.type = :type', { type });
    if (category) qb.andWhere('movement.category = :category', { category });
    if (reason) qb.andWhere('movement.reason = :reason', { reason });
    if (variantId) qb.andWhere('movement.variantId = :variantId', { variantId });
    if (search?.trim()) qb.andWhere('(variant.sku ILIKE :pattern OR product.name ILIKE :pattern)', { pattern: containsPattern(search) });

    const [rows, total] = await qb
      .orderBy('movement.createdAt', 'DESC')
      .addOrderBy('movement.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data: InventoryMovementHistoryItem[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      type: row.type,
      category: row.category,
      reason: row.reason,
      quantity: row.quantity,
      unitCost: row.unitCost,
      balanceAfter: row.balanceAfter,
      variantId: row.variantId,
      sku: row.variant.sku,
      productName: row.variant.product.name,
      originBranch: row.originBranch ? { id: row.originBranch.id, name: row.originBranch.name } : null,
      destinationBranch: row.destinationBranch ? { id: row.destinationBranch.id, name: row.destinationBranch.name } : null,
      purchaseOrderId: row.purchaseOrderId,
      document: row.document
        ? {
            id: row.document.id,
            number: row.document.number,
            comment: row.document.comment,
            userName: row.document.user?.name ?? null,
            kind: row.document.kind,
            // En un traslado, la otra sucursal: a dónde fue (si es la salida) o de dónde vino (si es la entrada)
            counterpartBranchName: row.document.destinationBranchId ? (row.type === InventoryMovementType.OUT ? row.document.destinationBranch?.name : row.document.branch?.name) ?? null : null,
          }
        : null,
    }));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

function emptyPage(page: number, limit: number): InventoryMovementHistoryPage {
  return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
}

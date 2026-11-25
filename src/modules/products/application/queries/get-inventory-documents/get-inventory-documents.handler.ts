import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch, visibleBranchIds } from '../../../../../common/security/branch-access.helper';
import { containsPattern } from '../../../../../common/utils/like';
import { parseReportDates } from '../../../../reports/application/queries/parse-dates.helper';
import { InventoryDocument } from '../../../domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { InventoryDocumentListPage } from '../../read-models/inventory-document';
import { GetInventoryDocumentsQuery } from './get-inventory-documents.query';

/** Lista de documentos de inventario del tenant, del más reciente al más antiguo, con filtros: un documento por fila. */
@QueryHandler(GetInventoryDocumentsQuery)
export class GetInventoryDocumentsHandler implements IQueryHandler<GetInventoryDocumentsQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetInventoryDocumentsQuery): Promise<InventoryDocumentListPage> {
    const { tenantId, userId, isOwner, filters } = query;
    const { page, limit, branchId, kind, search } = filters;

    // Con una sucursal concreta, el usuario debe tener acceso a ella; si no, ve solo los documentos de las suyas.
    if (branchId) {
      await assertUserCanAccessBranch(this.entityManager, this.redisService, { userId, isOwner, branchId, actionDescription: 'consultar los documentos de inventario' });
    }
    const allowedBranches = branchId ? null : await visibleBranchIds(this.entityManager, this.redisService, { userId, isOwner });
    if (allowedBranches && allowedBranches.length === 0) return emptyPage(page, limit);

    const { start, end } = await parseReportDates(this.entityManager, tenantId, filters.startDate, filters.endDate);

    const qb = this.entityManager
      .getRepository(InventoryDocument)
      .createQueryBuilder('document')
      // Un documento es un registro: se lista aunque su sucursal o su autor se hayan borrado después (el propio documento no se
      // borra). Va ANTES de los joins: TypeORM decide el filtro de borrados de cada join al declararlo.
      .withDeleted()
      .leftJoinAndSelect('document.branch', 'branch')
      .leftJoinAndSelect('document.destinationBranch', 'destination')
      .leftJoinAndSelect('document.user', 'author')
      .where('document.tenantId = :tenantId', { tenantId })
      .andWhere('document.deletedAt IS NULL')
      .andWhere('document.createdAt BETWEEN :start AND :end', { start, end });

    // Un traslado pertenece a las dos sucursales: aparece en la que envía y en la que recibe
    if (branchId) {
      qb.andWhere('(document.branchId = :branchId OR document.destinationBranchId = :branchId)', { branchId });
    } else if (allowedBranches) {
      qb.andWhere('(document.branchId IN (:...allowed) OR document.destinationBranchId IN (:...allowed))', { allowed: allowedBranches });
    }
    if (kind) qb.andWhere('document.kind = :kind', { kind });
    if (search?.trim()) {
      qb.andWhere(
        `(document.number ILIKE :pattern OR document.comment ILIKE :pattern OR EXISTS (
          SELECT 1 FROM inventory_movements line
          INNER JOIN product_variants variant ON variant.id = line.variant_id
          WHERE line.document_id = document.id AND (variant.sku ILIKE :pattern OR variant.barcode ILIKE :pattern)
        ))`,
        { pattern: containsPattern(search) },
      );
    }

    const [documents, total] = await qb
      .orderBy('document.createdAt', 'DESC')
      .addOrderBy('document.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const totals = await this.totalsOf(tenantId, documents.map((document) => document.id));

    return {
      data: documents.map((document) => ({
        id: document.id,
        number: document.number,
        kind: document.kind,
        reason: document.reason,
        comment: document.comment,
        createdAt: document.createdAt,
        userName: document.user?.name ?? null,
        branch: { id: document.branch.id, name: document.branch.name },
        destinationBranch: document.destinationBranch ? { id: document.destinationBranch.id, name: document.destinationBranch.name } : null,
        productsCount: totals.get(document.id)?.products ?? 0,
        unitsCount: totals.get(document.id)?.units ?? 0,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Productos y unidades de cada documento de la página, en una sola consulta (no una por documento). */
  private async totalsOf(tenantId: string, documentIds: string[]): Promise<Map<string, { products: number; units: number }>> {
    if (documentIds.length === 0) return new Map();
    const rows = await this.entityManager
      .getRepository(InventoryMovement)
      .createQueryBuilder('line')
      .innerJoin(InventoryDocument, 'document', 'document.id = line.documentId')
      .select('line.documentId', 'id')
      .addSelect('COUNT(DISTINCT line.variantId)', 'products')
      // En un traslado cada producto tiene salida y entrada: las unidades se cuentan una sola vez
      .addSelect(`COALESCE(SUM(CASE WHEN document.kind = 'TRANSFER' AND line.type = 'IN' THEN 0 ELSE line.quantity END), 0)`, 'units')
      .where('line.documentId IN (:...documentIds)', { documentIds })
      .andWhere('line.tenantId = :tenantId', { tenantId })
      .groupBy('line.documentId')
      .getRawMany<{ id: string; products: string; units: string }>();
    return new Map(rows.map((row) => [row.id, { products: Number(row.products), units: Number(row.units) }]));
  }
}

function emptyPage(page: number, limit: number): InventoryDocumentListPage {
  return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
}

import { HttpStatus } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch, visibleBranchIds } from '../../../../../common/security/branch-access.helper';
import { InventoryDocument } from '../../../domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { InventoryDocumentDetail } from '../../read-models/inventory-document';
import { GetInventoryDocumentQuery } from './get-inventory-document.query';

/** Un documento de inventario con todas sus líneas. Un documento de otra tienda no existe; de una sucursal sin acceso, 403. */
@QueryHandler(GetInventoryDocumentQuery)
export class GetInventoryDocumentHandler implements IQueryHandler<GetInventoryDocumentQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetInventoryDocumentQuery): Promise<InventoryDocumentDetail> {
    const { tenantId, userId, isOwner, documentId } = query;

    const document = await this.entityManager.getRepository(InventoryDocument).findOne({
      where: { id: documentId, tenantId },
      relations: { branch: true, destinationBranch: true, user: true },
    });
    if (!document) {
      throw new AppException(ErrorCode.InventoryDocumentNotFound, 'Documento de inventario no encontrado.', HttpStatus.NOT_FOUND, { documentId });
    }
    await this.assertCanSee(document, userId, isOwner);

    const movements = await this.entityManager.getRepository(InventoryMovement).find({
      where: { documentId: document.id, tenantId },
      relations: { variant: { product: true }, originBranch: true, destinationBranch: true },
    });

    return {
      id: document.id,
      number: document.number,
      kind: document.kind,
      reason: document.reason,
      comment: document.comment,
      createdAt: document.createdAt,
      userName: document.user?.name ?? null,
      branch: { id: document.branch.id, name: document.branch.name },
      destinationBranch: document.destinationBranch ? { id: document.destinationBranch.id, name: document.destinationBranch.name } : null,
      lines: movements
        .map((movement) => ({
          variantId: movement.variantId,
          sku: movement.variant.sku,
          productName: movement.variant.product.name,
          type: movement.type,
          quantity: movement.quantity,
          branchName: (movement.originBranch ?? movement.destinationBranch)?.name ?? null,
          unitCost: movement.unitCost,
          balanceAfter: movement.balanceAfter,
        }))
        // El mismo orden siempre: por SKU y, en un traslado, la salida antes que la entrada
        .sort((a, b) => a.sku.localeCompare(b.sku) || (a.type < b.type ? 1 : a.type > b.type ? -1 : 0)),
    };
  }

  /** Quien no es propietario ve el documento si tiene acceso a la sucursal que lo emitió o, en un traslado, a la que recibe. */
  private async assertCanSee(document: InventoryDocument, userId: string | undefined, isOwner: boolean | undefined): Promise<void> {
    const allowed = await visibleBranchIds(this.entityManager, this.redisService, { userId, isOwner });
    if (allowed === null) return;
    if (allowed.includes(document.branchId) || (document.destinationBranchId !== null && allowed.includes(document.destinationBranchId))) return;

    await assertUserCanAccessBranch(this.entityManager, this.redisService, { userId, isOwner, branchId: document.branchId, actionDescription: 'consultar este documento de inventario' });
  }
}

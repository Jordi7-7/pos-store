import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { findOrderProblem } from '../../../domain/attribute-order';
import { Attribute } from '../../../domain/entities/attribute.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { ReorderAttributeValuesCommand } from './reorder-attribute-values.command';

/** Fija el orden de las opciones de un atributo (S, M, L, XL…). Solo cambia cómo se muestran; las variantes no se tocan. */
@CommandHandler(ReorderAttributeValuesCommand)
export class ReorderAttributeValuesHandler implements ICommandHandler<ReorderAttributeValuesCommand> {
  private readonly logger = new Logger(ReorderAttributeValuesHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  execute(command: ReorderAttributeValuesCommand): Promise<void> {
    const { tenantId, attributeId, valueIds } = command;
    this.logger.log(`Reordering ${valueIds.length} values of attribute ${attributeId} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (manager) => {
      const attribute = await manager.getRepository(Attribute).findOne({ where: { id: attributeId, tenantId } });
      if (!attribute) throw new AppException(ErrorCode.AttributeNotFound, 'Atributo no encontrado.', HttpStatus.NOT_FOUND, { attributeId });

      // Se bloquean las opciones del atributo: dos reordenamientos a la vez no se mezclan
      const current = await manager.getRepository(AttributeValue).find({ where: { attributeId }, lock: { mode: 'pessimistic_write' }, order: { id: 'ASC' } });
      const problem = findOrderProblem(current.map((value) => value.id), valueIds);
      if (problem) {
        throw new AppException(ErrorCode.AttributeOrderStale, 'La lista de opciones cambió mientras la ordenabas; recárgala y vuelve a intentarlo.', HttpStatus.CONFLICT, { problem });
      }

      for (const [index, valueId] of valueIds.entries()) {
        await manager.getRepository(AttributeValue).update({ id: valueId, attributeId }, { sortOrder: index + 1 });
      }
    });
  }
}

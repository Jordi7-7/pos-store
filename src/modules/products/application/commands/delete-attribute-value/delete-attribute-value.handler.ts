import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { assertAttributeValuesUnused } from '../../services/attribute-usage';
import { DeleteAttributeValueCommand } from './delete-attribute-value.command';

/** Elimina una opción de un atributo (p. ej. la talla XXL), siempre que ninguna variante vigente la use. */
@CommandHandler(DeleteAttributeValueCommand)
export class DeleteAttributeValueHandler implements ICommandHandler<DeleteAttributeValueCommand> {
  private readonly logger = new Logger(DeleteAttributeValueHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  execute(command: DeleteAttributeValueCommand): Promise<void> {
    const { tenantId, valueId } = command;
    this.logger.log(`Deleting attribute value ${valueId} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (manager) => {
      // El valor no tiene tenant propio: se comprueba por el atributo al que pertenece
      const value = await manager.getRepository(AttributeValue).findOne({ where: { id: valueId, attribute: { tenantId } }, relations: { attribute: true } });
      if (!value) throw new AppException(ErrorCode.AttributeValuesNotFound, 'La opción no existe.', HttpStatus.NOT_FOUND, { valueId });

      await assertAttributeValuesUnused(manager, tenantId, [value.id], `La opción "${value.value}" de ${value.attribute.name}`);
      await manager.getRepository(AttributeValue).softRemove(value);
    });
  }
}

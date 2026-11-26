import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { Attribute } from '../../../domain/entities/attribute.entity';
import { assertAttributeValuesUnused } from '../../services/attribute-usage';
import { DeleteAttributeCommand } from './delete-attribute.command';

/** Elimina un atributo con todas sus opciones, siempre que ninguna variante vigente las use. */
@CommandHandler(DeleteAttributeCommand)
export class DeleteAttributeHandler implements ICommandHandler<DeleteAttributeCommand> {
  private readonly logger = new Logger(DeleteAttributeHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  execute(command: DeleteAttributeCommand): Promise<void> {
    const { tenantId, attributeId } = command;
    this.logger.log(`Deleting attribute ${attributeId} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (manager) => {
      const attribute = await manager.getRepository(Attribute).findOne({ where: { id: attributeId, tenantId }, relations: { values: true } });
      if (!attribute) throw new AppException(ErrorCode.AttributeNotFound, 'Atributo no encontrado.', HttpStatus.NOT_FOUND, { attributeId });

      await assertAttributeValuesUnused(manager, tenantId, attribute.values.map((value) => value.id), `El atributo "${attribute.name}"`);

      await manager.getRepository(AttributeValue).softRemove(attribute.values);
      await manager.getRepository(Attribute).softRemove(attribute);
    });
  }
}

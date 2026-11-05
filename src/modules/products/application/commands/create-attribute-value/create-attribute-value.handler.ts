import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateAttributeValueCommand } from './create-attribute-value.command';
import { Attribute } from '../../../domain/entities/attribute.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(CreateAttributeValueCommand)
export class CreateAttributeValueHandler implements ICommandHandler<CreateAttributeValueCommand> {
  private readonly logger = new Logger(CreateAttributeValueHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateAttributeValueCommand): Promise<AttributeValue> {
    const { tenantId, attributeId, value } = command;
    this.logger.log(`Adding attribute value: "${value}" to Attribute: ${attributeId} for Tenant: ${tenantId}`);

    const attributeRepo = this.entityManager.getRepository(Attribute);
    const valueRepo = this.entityManager.getRepository(AttributeValue);

    // 1. Verify parent Attribute exists and belongs to this tenant
    const attribute = await attributeRepo.findOne({
      where: {
        id: attributeId,
        tenantId,
      },
    });
    if (!attribute) {
      this.logger.warn(`Attribute value creation failed: Attribute ID ${attributeId} not found or belongs to another tenant`);
      throw new AppException(ErrorCode.AttributeNotFound, 'Atributo no encontrado.', HttpStatus.NOT_FOUND, { attributeId });
    }

    // 2. Prevent duplicate values for the same Attribute
    const existing = await valueRepo.findOne({
      where: {
        attributeId,
        value: value,
      },
    });
    if (existing) {
      this.logger.warn(`Attribute value creation failed: value "${value}" already exists for Attribute ${attributeId}`);
      throw new AppException(ErrorCode.AttributeValueTaken, `El valor "${value}" ya existe para este atributo.`, HttpStatus.CONFLICT, { value });
    }

    const attrValue = new AttributeValue();
    attrValue.attributeId = attributeId;
    attrValue.value = value;

    const savedValue = await valueRepo.save(attrValue);
    this.logger.log(`Attribute value created successfully: "${savedValue.value}" (ID: ${savedValue.id})`);

    return savedValue;
  }
}

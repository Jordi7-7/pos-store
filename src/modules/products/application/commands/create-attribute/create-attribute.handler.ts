import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateAttributeCommand } from './create-attribute.command';
import { Attribute } from '../../../domain/entities/attribute.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(CreateAttributeCommand)
export class CreateAttributeHandler implements ICommandHandler<CreateAttributeCommand> {
  private readonly logger = new Logger(CreateAttributeHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateAttributeCommand): Promise<Attribute> {
    const { tenantId, name } = command;
    this.logger.log(`Creating attribute: "${name}" for Tenant: ${tenantId}`);

    const attributeRepo = this.entityManager.getRepository(Attribute);

    // Case-insensitive name match to prevent duplicate attributes (e.g. "Color" and "color")
    const existing = await attributeRepo.findOne({
      where: {
        tenantId,
        name: name,
      },
    });

    if (existing) {
      this.logger.warn(`Attribute creation failed: attribute "${name}" already exists for Tenant ${tenantId}`);
      throw new AppException(ErrorCode.AttributeNameTaken, `El atributo "${name}" ya existe.`, HttpStatus.CONFLICT, { name });
    }

    const attribute = new Attribute();
    attribute.tenantId = tenantId;
    attribute.name = name;

    const savedAttribute = await attributeRepo.save(attribute);
    this.logger.log(`Attribute created successfully: "${savedAttribute.name}" (ID: ${savedAttribute.id})`);

    return savedAttribute;
  }
}

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateAttributeCommand } from './create-attribute.command';
import { Attribute, ATTRIBUTE_NAME_INDEX } from '../../../domain/entities/attribute.entity';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';
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

    const nameTaken = () => {
      this.logger.warn(`Attribute creation failed: attribute "${name}" already exists for Tenant ${tenantId}`);
      return new AppException(ErrorCode.AttributeNameTaken, `El atributo "${name}" ya existe.`, HttpStatus.CONFLICT, { name });
    };
    if (await attributeRepo.findOne({ where: { tenantId, name } })) throw nameTaken();

    const attribute = new Attribute();
    attribute.tenantId = tenantId;
    attribute.name = name;

    // Dos peticiones a la vez pueden pasar la comprobación: el índice único decide y se traduce al mismo error de negocio
    const savedAttribute = await attributeRepo.save(attribute).catch((error: unknown) => {
      throw isUniqueViolation(error, ATTRIBUTE_NAME_INDEX) ? nameTaken() : error;
    });
    this.logger.log(`Attribute created successfully: "${savedAttribute.name}" (ID: ${savedAttribute.id})`);

    return savedAttribute;
  }
}

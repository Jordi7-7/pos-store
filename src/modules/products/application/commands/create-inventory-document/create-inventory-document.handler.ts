import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { InventoryDocumentResult } from '../../read-models/inventory-document';
import { createInventoryDocument } from '../../services/create-inventory-document';
import { CreateInventoryDocumentCommand } from './create-inventory-document.command';

/** Entrada o salida manual con varias líneas, todo o nada. La lógica vive en `createInventoryDocument`. */
@CommandHandler(CreateInventoryDocumentCommand)
export class CreateInventoryDocumentHandler implements ICommandHandler<CreateInventoryDocumentCommand> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  execute(command: CreateInventoryDocumentCommand): Promise<InventoryDocumentResult> {
    return createInventoryDocument(this.entityManager, this.redisService, command);
  }
}

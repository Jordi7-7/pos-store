import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CreateSimpleProductCommand } from './create-simple-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { createSimpleProduct } from '../../services/create-simple-product';

@CommandHandler(CreateSimpleProductCommand)
export class CreateSimpleProductHandler implements ICommandHandler<CreateSimpleProductCommand> {
  constructor(private readonly entityManager: EntityManager) {}

  execute(command: CreateSimpleProductCommand): Promise<Product> {
    return createSimpleProduct(this.entityManager, command);
  }
}

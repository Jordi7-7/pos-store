import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CreateVariableProductCommand } from './create-variable-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { createVariableProduct } from '../../services/create-variable-product';

@CommandHandler(CreateVariableProductCommand)
export class CreateVariableProductHandler implements ICommandHandler<CreateVariableProductCommand> {
  constructor(private readonly entityManager: EntityManager) {}

  execute(command: CreateVariableProductCommand): Promise<Product> {
    return createVariableProduct(this.entityManager, command);
  }
}

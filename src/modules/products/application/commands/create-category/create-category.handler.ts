import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateCategoryCommand } from './create-category.command';
import { Category } from '../../../domain/entities/category.entity';

@CommandHandler(CreateCategoryCommand)
export class CreateCategoryHandler implements ICommandHandler<CreateCategoryCommand> {
  private readonly logger = new Logger(CreateCategoryHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateCategoryCommand): Promise<Category> {
    const { tenantId, name } = command;
    this.logger.log(`Creating category: "${name}" for Tenant: ${tenantId}`);

    const categoryRepo = this.entityManager.getRepository(Category);

    const existing = await categoryRepo.findOne({
      where: { tenantId, name },
    });

    if (existing) {
      this.logger.warn(`Category creation failed: Category name "${name}" already exists for Tenant ${tenantId}`);
      throw new BadRequestException(`Category with name "${name}" already exists`);
    }

    const category = new Category();
    category.tenantId = tenantId;
    category.name = name;

    const savedCategory = await categoryRepo.save(category);
    this.logger.log(`Category created successfully: "${savedCategory.name}" (ID: ${savedCategory.id})`);

    return savedCategory;
  }
}

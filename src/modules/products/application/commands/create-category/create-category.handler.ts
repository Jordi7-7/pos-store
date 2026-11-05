import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateCategoryCommand } from './create-category.command';
import { Category } from '../../../domain/entities/category.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

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
      throw new AppException(ErrorCode.CategoryNameTaken, `La categoría "${name}" ya existe.`, HttpStatus.CONFLICT, { name });
    }

    const category = new Category();
    category.tenantId = tenantId;
    category.name = name;

    const savedCategory = await categoryRepo.save(category);
    this.logger.log(`Category created successfully: "${savedCategory.name}" (ID: ${savedCategory.id})`);

    return savedCategory;
  }
}

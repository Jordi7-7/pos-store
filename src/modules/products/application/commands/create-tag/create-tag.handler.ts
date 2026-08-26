import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CreateTagCommand } from './create-tag.command';
import { Tag } from '../../../domain/entities/tag.entity';

@CommandHandler(CreateTagCommand)
export class CreateTagHandler implements ICommandHandler<CreateTagCommand> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateTagCommand): Promise<Tag> {
    const { tenantId, name } = command;
    const repo = this.entityManager.getRepository(Tag);
    const trimmedName = name.trim();

    // Check duplicate tag case insensitively
    const existing = await repo
      .createQueryBuilder('tag')
      .where('tag.tenantId = :tenantId', { tenantId })
      .andWhere('LOWER(tag.name) = LOWER(:name)', { name: trimmedName })
      .getOne();

    if (existing) {
      return existing;
    }

    const tag = repo.create({ tenantId, name: trimmedName });
    return repo.save(tag);
  }
}

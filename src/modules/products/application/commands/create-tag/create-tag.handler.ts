import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CreateTagCommand } from './create-tag.command';
import { Tag } from '../../../domain/entities/tag.entity';

@CommandHandler(CreateTagCommand)
export class CreateTagHandler implements ICommandHandler<CreateTagCommand> {
  private readonly logger = new Logger(CreateTagHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateTagCommand): Promise<Tag> {
    const { tenantId, name } = command;
    this.logger.log(`Creating tag for Tenant ${tenantId}`);
    const trimmedName = name.trim();

    // No hay índice único sobre el nombre: dos altas simultáneas de la misma etiqueta se serializan aquí
    return this.entityManager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tags:${tenantId}:${trimmedName.toLowerCase()}`]);
      const repo = manager.getRepository(Tag);

      const existing = await repo
        .createQueryBuilder('tag')
        .where('tag.tenantId = :tenantId', { tenantId })
        .andWhere('LOWER(tag.name) = LOWER(:name)', { name: trimmedName })
        .getOne();
      if (existing) {
        this.logger.log(`Tag ${existing.id} already exists for Tenant ${tenantId}; reusing it`);
        return existing;
      }

      const saved = await repo.save(repo.create({ tenantId, name: trimmedName }));
      this.logger.log(`Tag ${saved.id} created for Tenant ${tenantId}`);
      return saved;
    });
  }
}

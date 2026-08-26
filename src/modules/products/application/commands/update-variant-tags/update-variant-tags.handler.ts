import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { UpdateVariantTagsCommand } from './update-variant-tags.command';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { Tag } from '../../../domain/entities/tag.entity';

@CommandHandler(UpdateVariantTagsCommand)
export class UpdateVariantTagsHandler implements ICommandHandler<UpdateVariantTagsCommand> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateVariantTagsCommand): Promise<ProductVariant> {
    const { tenantId, variantId, tagIds } = command;
    const variantRepo = this.entityManager.getRepository(ProductVariant);
    const tagRepo = this.entityManager.getRepository(Tag);

    const variant = await variantRepo.findOne({
      where: { id: variantId, tenantId },
      relations: { tags: true },
    });

    if (!variant) {
      throw new NotFoundException(`La variante con ID ${variantId} no existe.`);
    }

    const tags = tagIds.length > 0
      ? await tagRepo.find({ where: { id: In(tagIds), tenantId } })
      : [];

    variant.tags = tags;
    return variantRepo.save(variant);
  }
}

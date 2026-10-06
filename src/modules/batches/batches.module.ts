import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Batch } from './domain/entities/batch.entity';
import { ProductBatch } from '../products/domain/entities/product-batch.entity';
import { BatchesController } from './infrastructure/controllers/batches.controller';
import { GetBatchesHandler } from './application/queries/get-batches/get-batches.handler';
import { GetBatchesByVariantHandler } from './application/queries/get-batches-by-variant/get-batches-by-variant.handler';

export const QueryHandlers = [GetBatchesHandler, GetBatchesByVariantHandler];

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Batch, ProductBatch]),
  ],
  controllers: [BatchesController],
  providers: [...QueryHandlers],
  exports: [TypeOrmModule],
})
export class BatchesModule {}

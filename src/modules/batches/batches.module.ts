import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Batch } from './domain/entities/batch.entity';
import { ProductBatch } from '../products/domain/entities/product-batch.entity';
import { BatchesController } from './infrastructure/controllers/batches.controller';
import { GetBatchesHandler } from './application/queries/get-batches/get-batches.handler';

export const QueryHandlers = [GetBatchesHandler];

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

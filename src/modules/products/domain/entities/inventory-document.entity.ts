import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../../users/domain/entities/user.entity';
import { Branch } from '../../../branches/domain/entities/branch.entity';
import { BaseEntity } from '../../../../common/database/base.entity';
import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';

/** Índice único que impide registrar dos veces el mismo documento reintentado por el cliente. */
export const INVENTORY_DOCUMENT_CLIENT_REQUEST_INDEX = 'UQ_inventory_documents_tenant_client_request';

/**
 * Cabecera de una entrada o salida manual de inventario. Sus líneas son los movimientos del kardex
 * (`inventory_movements.document_id`) y, en una entrada, el lote que crea (`batches.document_id`).
 */
@Entity('inventory_documents')
@Index('UQ_inventory_documents_tenant_number', ['tenantId', 'number'], { unique: true })
@Index(INVENTORY_DOCUMENT_CLIENT_REQUEST_INDEX, ['tenantId', 'clientRequestId'], { unique: true, where: '"client_request_id" IS NOT NULL' })
export class InventoryDocument extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  /** Solo en traslados: la sucursal que recibe (`branchId` es la que envía). */
  @Column({ name: 'destination_branch_id', type: 'uuid', nullable: true })
  destinationBranchId: string | null;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'destination_branch_id' })
  destinationBranch: Branch | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 20 })
  kind: InventoryDocumentKind;

  @Column({ type: 'varchar', length: 30 })
  number: string;

  @Column({ type: 'varchar', length: 50 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId: string | null;
}

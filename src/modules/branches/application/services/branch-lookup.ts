import { HttpStatus } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { Branch } from '../../domain/entities/branch.entity';

const notFound = (branchId: string) => new AppException(ErrorCode.BranchNotFound, `La sucursal con ID "${branchId}" no existe o no pertenece a la tienda.`, HttpStatus.NOT_FOUND, { branchId });

/** La sucursal de la tienda, o 404 `BRANCH_NOT_FOUND`: una de otra tienda se comporta como si no existiera. */
export async function findBranchOrFail(manager: EntityManager, tenantId: string, branchId: string): Promise<Branch> {
  const branch = await manager.getRepository(Branch).findOne({ where: { id: branchId, tenantId } });
  if (!branch) throw notFound(branchId);
  return branch;
}

/** Comprueba, con una sola consulta, que todas las sucursales son de la tienda; si no, 404 con la primera que no lo es. */
export async function assertBranchesExist(manager: EntityManager, tenantId: string, branchIds: readonly string[]): Promise<void> {
  const wanted = [...new Set(branchIds)];
  if (wanted.length === 0) return;
  const found = new Set((await manager.getRepository(Branch).find({ where: { id: In(wanted), tenantId }, select: { id: true } })).map((branch) => branch.id));
  const missing = wanted.find((id) => !found.has(id));
  if (missing) throw notFound(missing);
}

import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CashRegister } from '../../../domain/entities/cash-register.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { formatInvoiceNumber } from '../../../domain/services/invoice-number';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

/**
 * Toma el siguiente número de factura de la caja de la sesión. La fila de la caja se bloquea hasta
 * el final de la transacción, así que dos ventas simultáneas nunca reciben el mismo número.
 * Una sesión antigua sin caja usa (y crea si falta) la caja principal de la sucursal.
 */
export async function reserveInvoiceNumber(
  manager: EntityManager,
  scope: { tenantId: string; branchId: string; cashSession: CashSession },
): Promise<string> {
  const { tenantId, branchId, cashSession } = scope;
  const registerRepo = manager.getRepository(CashRegister);

  const registerId = cashSession.cashRegisterId ?? (await findOrCreateMainRegister(manager, tenantId, branchId)).id;

  const register = await registerRepo.findOne({ where: { id: registerId }, lock: { mode: 'pessimistic_write' } });
  if (!register) {
    throw new AppException(ErrorCode.CashRegisterNotFound, 'Caja registradora no encontrada.', HttpStatus.NOT_FOUND);
  }

  const invoiceNumber = formatInvoiceNumber(cashSession.branch.code, register.code, register.nextInvoiceNumber);
  register.nextInvoiceNumber += 1;
  await registerRepo.save(register);
  return invoiceNumber;
}

async function findOrCreateMainRegister(manager: EntityManager, tenantId: string, branchId: string): Promise<CashRegister> {
  const registerRepo = manager.getRepository(CashRegister);
  const existing = await registerRepo.findOne({ where: { branchId, code: 1, tenantId } });
  if (existing) return existing;

  const register = new CashRegister();
  register.tenantId = tenantId;
  register.branchId = branchId;
  register.code = 1;
  register.name = 'Caja Principal 1';
  register.nextInvoiceNumber = 1;
  return registerRepo.save(register);
}

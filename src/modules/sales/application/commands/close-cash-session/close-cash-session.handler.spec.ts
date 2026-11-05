import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { CloseCashSessionCommand } from './close-cash-session.command';
import { CloseCashSessionHandler } from './close-cash-session.handler';

describe('CloseCashSessionHandler', () => {
  const calls: string[] = [];
  const query = jest.fn((sql: string) => {
    calls.push(`query:${sql.includes('FOR UPDATE') ? 'FOR UPDATE' : sql}`);
    return Promise.resolve([]);
  });
  const findOne = jest.fn();
  const save = jest.fn((s: CashSession) => Promise.resolve(s));
  const rawTotal = (total: string) => ({
    innerJoin: () => rawTotal(total),
    where: () => rawTotal(total),
    andWhere: () => rawTotal(total),
    select: () => rawTotal(total),
    getRawOne: () => Promise.resolve({ total }),
  });
  const totals = ['100', '10', '5']; // efectivo, gastos, devoluciones
  const transactionalManager = {
    query,
    getRepository: () => ({ findOne, save }),
    createQueryBuilder: () => rawTotal(totals.shift() ?? '0'),
  } as unknown as EntityManager;
  const entityManager = {
    transaction: (cb: (m: EntityManager) => Promise<unknown>) => cb(transactionalManager),
  } as unknown as EntityManager;
  const handler = new CloseCashSessionHandler(entityManager);

  beforeEach(() => {
    calls.length = 0;
    totals.splice(0, totals.length, '100', '10', '5');
    findOne.mockReset();
    save.mockClear();
  });

  it('bloquea la sesión (FOR UPDATE) ANTES de leerla y calcular el arqueo', async () => {
    findOne.mockImplementation(() => {
      calls.push('findOne');
      return Promise.resolve({ id: 's1', openingBalance: 50 } as unknown as CashSession);
    });

    await handler.execute(new CloseCashSessionCommand('t1', 's1', 130));

    expect(calls[0]).toBe('query:FOR UPDATE');
    expect(calls.indexOf('findOne')).toBeGreaterThan(0);
  });

  it('calcula esperado y diferencia: apertura + efectivo - gastos - devoluciones', async () => {
    findOne.mockResolvedValue({ id: 's1', openingBalance: 50 } as unknown as CashSession);

    const session = await handler.execute(new CloseCashSessionCommand('t1', 's1', 130));

    expect(session.expectedBalance).toBe(135); // 50 + 100 - 10 - 5
    expect(session.difference).toBe(-5); // 130 - 135
    expect(session.closingBalance).toBe(130);
  });

  it('falla si la sesión no está abierta o es de otro tenant', async () => {
    findOne.mockResolvedValue(null);

    await expect(handler.execute(new CloseCashSessionCommand('t1', 's1', 0))).rejects.toThrow(NotFoundException);
    expect(save).not.toHaveBeenCalled();
  });
});

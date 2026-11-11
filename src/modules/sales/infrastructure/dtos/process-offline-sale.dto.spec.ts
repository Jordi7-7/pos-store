import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProcessOfflineSaleDto, ProcessSaleDto } from './process-sale.dto';

const UUID = '3f1d6b1e-6c1a-4f0e-9d3a-2b6f0a7c1e11';
const base = {
  branchId: UUID,
  cashSessionId: UUID,
  items: [{ variantId: UUID, quantity: 1, price: 10 }],
  payments: [{ paymentMethod: 'EFECTIVO', amount: 10 }],
};
const offline = { ...base, clientRequestId: 'intento-0001', occurredAt: '2026-11-10T15:30:00.000Z', offlineReference: 'OFF-K7Q2-0007' };

/** Mismas opciones que el ValidationPipe real (`whitelist: true`). */
const check = async <T extends object>(cls: new () => T, plain: object) => {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true });
  return { instance, failing: errors.map((e) => e.property).sort() };
};

describe('POST /sales/offline: DTO', () => {
  it('acepta una venta con los tres datos del modo sin conexión', async () => {
    expect((await check(ProcessOfflineSaleDto, offline)).failing).toEqual([]);
  });

  it('exige clientRequestId, occurredAt y offlineReference: sin cualquiera de ellos se rechaza', async () => {
    for (const field of ['clientRequestId', 'occurredAt', 'offlineReference']) {
      const { [field as keyof typeof offline]: _omitted, ...without } = offline;
      expect((await check(ProcessOfflineSaleDto, without)).failing).toEqual([field]);
    }
  });

  it('rechaza una hora que no es ISO 8601 y un número provisional con caracteres no válidos o demasiado corto', async () => {
    expect((await check(ProcessOfflineSaleDto, { ...offline, occurredAt: 'ayer' })).failing).toEqual(['occurredAt']);
    expect((await check(ProcessOfflineSaleDto, { ...offline, offlineReference: 'OFF 1' })).failing).toEqual(['offlineReference']);
    expect((await check(ProcessOfflineSaleDto, { ...offline, offlineReference: 'OFF-1' })).failing).toEqual(['offlineReference']);
  });
});

describe('POST /sales: DTO en línea', () => {
  it('sigue aceptando una venta sin clientRequestId (aún es opcional)', async () => {
    expect((await check(ProcessSaleDto, base)).failing).toEqual([]);
  });

  it('descarta occurredAt y offlineReference: una venta en línea no puede cambiar su hora ni su número', async () => {
    const { instance } = await check(ProcessSaleDto, { ...base, occurredAt: '2026-11-10T08:00:00.000Z', offlineReference: 'OFF-K7Q2-0007' });

    expect(instance).not.toHaveProperty('occurredAt');
    expect(instance).not.toHaveProperty('offlineReference');
  });
});

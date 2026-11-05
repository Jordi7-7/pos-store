import { CashSessionStatus } from '../../../domain/enums/cash-session-status.enum';
import { CashSessionRow, toCashSessionListItem } from './cash-session-list-item';

describe('toCashSessionListItem', () => {
  const opened = new Date('2026-11-04T10:00:00Z');
  const row: CashSessionRow = {
    id: 's1',
    status: CashSessionStatus.CLOSED,
    openedAt: opened,
    closedAt: new Date('2026-11-04T18:00:00Z'),
    openingBalance: '50.00',
    closingBalance: '150.10',
    expectedBalance: '150.00',
    difference: '0.10',
    branchId: 'b1',
    branchName: 'Matriz',
    branchAddress: null,
    cashRegisterId: 'c1',
    cashRegisterName: 'Caja 1',
    cashRegisterCode: '1',
    userId: 'u1',
    userName: 'Ana',
    totalSales: '230.50',
  };

  it('convierte los importes de texto a número exacto y agrupa por entidad', () => {
    expect(toCashSessionListItem(row)).toEqual({
      id: 's1',
      status: CashSessionStatus.CLOSED,
      openedAt: opened,
      closedAt: new Date('2026-11-04T18:00:00Z'),
      openingBalance: 50,
      closingBalance: 150.1,
      expectedBalance: 150,
      difference: 0.1,
      branch: { id: 'b1', name: 'Matriz', address: '' },
      cashRegister: { id: 'c1', name: 'Caja 1', code: 1 },
      user: { id: 'u1', name: 'Ana' },
      totalSales: 230.5,
    });
  });

  it('una sesión abierta conserva los importes de cierre como null (no 0)', () => {
    const open = toCashSessionListItem({ ...row, status: CashSessionStatus.OPEN, closedAt: null, closingBalance: null, expectedBalance: null, difference: null });

    expect(open.closingBalance).toBeNull();
    expect(open.expectedBalance).toBeNull();
    expect(open.difference).toBeNull();
  });

  it('una sesión sin ventas tiene total 0', () => {
    expect(toCashSessionListItem({ ...row, totalSales: null }).totalSales).toBe(0);
  });
});

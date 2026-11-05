import { Money } from '../../../../../common/domain/money';

export interface CashSessionListItemDto {
  id: string;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  difference: number | null;
  branch: {
    id: string;
    name: string;
    address: string;
  };
  cashRegister: {
    id: string;
    name: string;
    code: number;
  };
  user: {
    id: string;
    name: string;
  };
  totalSales: number;
}

/** Fila tal como la devuelve Postgres: numeric llega como texto y los joins opcionales como null. */
export interface CashSessionRow {
  id: string;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  openingBalance: string | number | null;
  closingBalance: string | number | null;
  expectedBalance: string | number | null;
  difference: string | number | null;
  branchId: string;
  branchName: string;
  branchAddress: string | null;
  cashRegisterId: string;
  cashRegisterName: string;
  cashRegisterCode: string | number;
  userId: string;
  userName: string;
  totalSales: string | number | null;
}

function amount(value: string | number | null): number {
  return Money.of(value ?? 0).toNumber();
}

function nullableAmount(value: string | number | null): number | null {
  return value === null ? null : amount(value);
}

export function toCashSessionListItem(row: CashSessionRow): CashSessionListItemDto {
  return {
    id: row.id,
    status: row.status,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    openingBalance: amount(row.openingBalance),
    closingBalance: nullableAmount(row.closingBalance),
    expectedBalance: nullableAmount(row.expectedBalance),
    difference: nullableAmount(row.difference),
    branch: { id: row.branchId, name: row.branchName, address: row.branchAddress || '' },
    cashRegister: { id: row.cashRegisterId, name: row.cashRegisterName, code: Number(row.cashRegisterCode) },
    user: { id: row.userId, name: row.userName },
    totalSales: amount(row.totalSales),
  };
}

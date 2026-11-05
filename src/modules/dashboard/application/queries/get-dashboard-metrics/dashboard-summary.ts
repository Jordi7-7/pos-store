import { Money } from '../../../../../common/domain/money';
import { DashboardMetricsDto } from './dashboard-metrics.read-model';

/** Postgres devuelve numeric/bigint como texto; los agregados vacíos llegan como null. */
type Numeric = string | number | null | undefined;

export interface TodaySalesRow {
  totalSales: Numeric;
  itemsCount: Numeric;
}

export interface TodayRefundsRow {
  totalRefunded: Numeric;
  refundedItemsCount: Numeric;
  refundsCount: Numeric;
}

export interface PaymentMethodRow {
  method: string;
  amount: Numeric;
}

export interface TopProductRow {
  variantId: string;
  productName: string;
  sku: string;
  imageUrl: string | null;
  quantitySold: Numeric;
}

export interface LowStockRow {
  variantId: string;
  productName: string;
  sku: string;
  stock: Numeric;
}

export interface SoldYesterdayRow {
  variantId: string;
  productName: string;
  sku: string;
  currentStock: Numeric;
}

export interface WeekDayRow {
  /** Día ISO de la semana: 1 = lunes … 7 = domingo. */
  dayOfWeek: Numeric;
  total: Numeric;
}

const WEEK_DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const CASH_METHOD = 'EFECTIVO';
const CARD_METHOD = 'TARJETA';

function toNumber(value: Numeric): number {
  return Number(value || 0);
}

function toMoney(value: Numeric): Money {
  return Money.of(toNumber(value));
}

function percentage(part: Money, whole: Money): number {
  return whole.isPositive() ? Math.round((part.toNumber() / whole.toNumber()) * 100) : 0;
}

export function buildToday(sales: TodaySalesRow | undefined, refunds: TodayRefundsRow | undefined): DashboardMetricsDto['today'] {
  const gross = toMoney(sales?.totalSales);
  const refunded = toMoney(refunds?.totalRefunded);
  const net = gross.minus(refunded);

  const itemsCount = toNumber(sales?.itemsCount);
  const refundedItems = toNumber(refunds?.refundedItemsCount);

  return {
    totalSales: gross.toNumber(),
    itemsCount,
    netSales: net.isNegative() ? 0 : net.toNumber(),
    netItemsCount: Math.max(0, itemsCount - refundedItems),
    refunds: {
      totalRefunded: refunded.toNumber(),
      itemsCount: refundedItems,
      count: toNumber(refunds?.refundsCount),
    },
  };
}

export function buildPaymentMethods(rows: readonly PaymentMethodRow[]): DashboardMetricsDto['paymentMethods'] {
  const cash = Money.sum(rows.filter((row) => row.method === CASH_METHOD).map((row) => toMoney(row.amount)));
  const card = Money.sum(rows.filter((row) => row.method === CARD_METHOD).map((row) => toMoney(row.amount)));
  const total = cash.plus(card);

  return {
    total: total.toNumber(),
    cash: { amount: cash.toNumber(), percentage: percentage(cash, total) },
    card: { amount: card.toNumber(), percentage: percentage(card, total) },
  };
}

export function buildWeekSummary(
  currentWeek: readonly WeekDayRow[],
  previousWeekTotal: Numeric,
): DashboardMetricsDto['weekSummary'] {
  const totalByDay = new Map<number, Money>();
  for (const row of currentWeek) {
    totalByDay.set(toNumber(row.dayOfWeek), toMoney(row.total));
  }

  const dailyBreakdown = WEEK_DAY_LABELS.map((label, index) => ({
    dayKey: String(index + 1),
    label,
    total: (totalByDay.get(index + 1) ?? Money.ZERO).toNumber(),
  }));

  const currentTotal = Money.sum([...totalByDay.values()]);
  const previousTotal = toMoney(previousWeekTotal);

  let changePercentage = 0;
  if (previousTotal.isPositive()) {
    changePercentage = Math.round(((currentTotal.toNumber() - previousTotal.toNumber()) / previousTotal.toNumber()) * 100);
  } else if (currentTotal.isPositive()) {
    changePercentage = 100;
  }

  return { totalWeek: currentTotal.toNumber(), changePercentage, dailyBreakdown };
}

function publicImageUrl(url: string | null, publicBaseUrl: string): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicBaseUrl}/${url}`;
}

export function buildTopProducts(rows: readonly TopProductRow[], publicBaseUrl: string): DashboardMetricsDto['topProducts'] {
  return rows.map((row) => ({
    variantId: row.variantId,
    productName: row.productName,
    sku: row.sku,
    imageUrl: publicImageUrl(row.imageUrl, publicBaseUrl),
    quantitySold: toNumber(row.quantitySold),
  }));
}

export function buildLowStockProducts(rows: readonly LowStockRow[]): DashboardMetricsDto['lowStockProducts'] {
  return rows.map((row) => ({
    variantId: row.variantId,
    productName: row.productName,
    sku: row.sku,
    stock: toNumber(row.stock),
  }));
}

export function buildYesterdaySoldProducts(rows: readonly SoldYesterdayRow[]): DashboardMetricsDto['yesterdaySoldProducts'] {
  return rows.map((row) => ({
    variantId: row.variantId,
    productName: row.productName,
    sku: row.sku,
    currentStock: toNumber(row.currentStock),
  }));
}

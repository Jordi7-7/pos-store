import { Money } from './money';

/**
 * Las cantidades tienen 2 decimales, igual que el dinero (`numeric(10,2)`), así que se suman y
 * restan con la misma aritmética exacta: 0.1 + 0.7 da 0.8 y no 0.7999999999999999.
 */
export function addQuantities(a: number, b: number): number {
  return Money.of(a).plus(Money.of(b)).toNumber();
}

export function subtractQuantities(a: number, b: number): number {
  return Money.of(a).minus(Money.of(b)).toNumber();
}

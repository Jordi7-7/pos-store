const CENTS_PER_UNIT_SCALE = 2;

interface ExactDecimal {
  /** Valor sin punto decimal: 12.34 -> 1234n. */
  digits: bigint;
  /** Decimales que representa `digits`: 12.34 -> 2. */
  scale: number;
}

function parseDecimal(value: number | string): ExactDecimal {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new RangeError(`Importe no válido: ${value}`);
  }

  // `String(1e-7)` usa notación exponencial; `toFixed` la expande sin perder los decimales útiles.
  const raw = typeof value === 'number' ? String(value) : value.trim();
  const text = /e/i.test(raw) ? Number(raw).toFixed(20) : raw;
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) {
    throw new RangeError(`Importe no válido: ${String(value)}`);
  }

  const [, sign, integerPart, fractionPart = ''] = match;
  const digits = BigInt(`${integerPart}${fractionPart}` || '0');
  return { digits: sign ? -digits : digits, scale: fractionPart.length };
}

/** División entera redondeando la mitad hacia afuera de cero (1.005 -> 1.01, -1.005 -> -1.01). */
function divideRoundingHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const rounded = (absoluteNumerator * 2n + absoluteDenominator) / (absoluteDenominator * 2n);
  return negative ? -rounded : rounded;
}

function exactProductInCents(factors: ExactDecimal[]): bigint {
  const digits = factors.reduce((product, factor) => product * factor.digits, 1n);
  const scale = factors.reduce((total, factor) => total + factor.scale, 0);
  const excessDecimals = scale - CENTS_PER_UNIT_SCALE;
  return excessDecimals >= 0
    ? divideRoundingHalfUp(digits, 10n ** BigInt(excessDecimals))
    : digits * 10n ** BigInt(-excessDecimals);
}

/**
 * Importe monetario inmutable, guardado como céntimos enteros para que las operaciones sean
 * exactas. Coincide con las columnas `numeric(10,2)`: entra y sale como número con 2 decimales.
 * Es el único sitio donde se redondea dinero en el dominio.
 */
export class Money {
  static readonly ZERO = new Money(0);

  private constructor(private readonly cents: number) {}

  static of(value: number | string): Money {
    return Money.fromBigInt(exactProductInCents([parseDecimal(value)]));
  }

  /**
   * Importe de una línea: multiplica primero y redondea una sola vez. Un precio con más de 2
   * decimales no se trunca antes de multiplicar (3.333 x 3 = 10.00, no 9.99).
   */
  static ofLine(unitPrice: number, quantity: number): Money {
    return Money.fromBigInt(exactProductInCents([parseDecimal(unitPrice), parseDecimal(quantity)]));
  }

  static sum(amounts: readonly Money[]): Money {
    return amounts.reduce((total, amount) => total.plus(amount), Money.ZERO);
  }

  private static fromBigInt(cents: bigint): Money {
    const value = Number(cents);
    if (!Number.isSafeInteger(value)) {
      throw new RangeError('Importe fuera de rango.');
    }
    return new Money(value);
  }

  plus(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  minus(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  /** Parte proporcional `part / whole` de este importe, redondeada a céntimos. */
  fraction(part: number, whole: number): Money {
    const partDecimal = parseDecimal(part);
    const wholeDecimal = parseDecimal(whole);
    if (wholeDecimal.digits === 0n) {
      throw new RangeError('La fracción no puede tener denominador 0.');
    }
    const numerator = BigInt(this.cents) * partDecimal.digits * 10n ** BigInt(wholeDecimal.scale);
    const denominator = wholeDecimal.digits * 10n ** BigInt(partDecimal.scale);
    return Money.fromBigInt(divideRoundingHalfUp(numerator, denominator));
  }

  /**
   * Reparte este importe en proporción a `weights` sin perder céntimos: la suma de las partes
   * es exactamente el importe, y ninguna parte supera a su peso si el importe no supera su suma.
   * Los céntimos sobrantes van a las partes con mayor resto (en empate, a las primeras).
   */
  allocate(weights: readonly Money[]): Money[] {
    const totalWeight = weights.reduce((total, weight) => total + BigInt(weight.cents), 0n);
    if (this.cents === 0 || totalWeight === 0n) {
      if (this.cents !== 0) throw new RangeError('No se puede repartir un importe sin pesos.');
      return weights.map(() => Money.ZERO);
    }

    const shares = weights.map((weight, index) => {
      const product = BigInt(this.cents) * BigInt(weight.cents);
      return { index, cents: product / totalWeight, remainder: product % totalWeight };
    });

    const assigned = shares.reduce((total, share) => total + share.cents, 0n);
    const leftover = Number(BigInt(this.cents) - assigned);
    const byLargestRemainder = [...shares].sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
    for (const share of byLargestRemainder.slice(0, leftover)) {
      share.cents += 1n;
    }

    return shares.map((share) => Money.fromBigInt(share.cents));
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  greaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  lessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  /** Valor para persistir o devolver por la API: número con 2 decimales. */
  toNumber(): number {
    return this.cents / 100;
  }

  /** Texto con 2 decimales para mensajes: `12.50`. */
  toString(): string {
    return this.toNumber().toFixed(CENTS_PER_UNIT_SCALE);
  }
}

import { Money } from './money';

const amounts = (...values: number[]): Money[] => values.map((value) => Money.of(value));
const numbers = (list: Money[]): number[] => list.map((amount) => amount.toNumber());

describe('Money', () => {
  describe('creación', () => {
    it.each([
      [19.99, 19.99],
      ['19.99', 19.99],
      [0, 0],
      [-5.5, -5.5],
      [100, 100],
      ['.5', 0.5],
    ])('Money.of(%p) = %p', (input, expected) => {
      expect(Money.of(input).toNumber()).toBe(expected);
    });

    it('redondea la mitad hacia arriba según el decimal escrito, no su valor binario', () => {
      expect((1.005).toFixed(2)).toBe('1.00'); // el error que Money evita
      expect(Money.of(1.005).toNumber()).toBe(1.01);
      expect(Money.of(-1.005).toNumber()).toBe(-1.01);
      expect(Money.of(1.004).toNumber()).toBe(1);
    });

    it('absorbe artefactos de coma flotante', () => {
      expect(Money.of(0.1 + 0.2).toNumber()).toBe(0.3);
    });

    it('acepta números muy pequeños en notación exponencial', () => {
      expect(Money.of(1e-7).toNumber()).toBe(0);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, 'abc', '', '.'])('rechaza %p', (input) => {
      expect(() => Money.of(input)).toThrow(RangeError);
    });
  });

  describe('ofLine', () => {
    it('multiplica antes de redondear', () => {
      expect(Money.ofLine(3.333, 3).toNumber()).toBe(10);
      expect(Money.ofLine(0.1, 3).toNumber()).toBe(0.3);
    });

    it('es exacto con cantidades fraccionarias', () => {
      expect(Money.ofLine(0.15, 0.7).toNumber()).toBe(0.11);
      expect(Money.ofLine(19.99, 1.5).toNumber()).toBe(29.99);
    });
  });

  describe('aritmética', () => {
    it('suma y resta sin errores de coma flotante', () => {
      expect(Money.of(0.1).plus(Money.of(0.2)).toNumber()).toBe(0.3);
      expect(Money.of(0.3).minus(Money.of(0.1)).toNumber()).toBe(0.2);
      expect(Money.sum(amounts(0.1, 0.2, 0.3)).toNumber()).toBe(0.6);
      expect(Money.sum([]).isZero()).toBe(true);
    });

    it('no muta los operandos', () => {
      const base = Money.of(10);
      base.plus(Money.of(5));
      expect(base.toNumber()).toBe(10);
    });

    it('calcula fracciones redondeadas', () => {
      expect(Money.of(10).fraction(1, 3).toNumber()).toBe(3.33);
      expect(Money.of(10).fraction(2, 3).toNumber()).toBe(6.67);
      expect(Money.of(10).fraction(1.5, 3).toNumber()).toBe(5);
      expect(() => Money.of(10).fraction(1, 0)).toThrow(RangeError);
    });

    it('compara importes', () => {
      expect(Money.of(2).greaterThan(Money.of(1))).toBe(true);
      expect(Money.of(1).lessThan(Money.of(2))).toBe(true);
      expect(Money.of(1).equals(Money.of(1.0))).toBe(true);
      expect(Money.of(-1).isNegative()).toBe(true);
      expect(Money.of(1).isPositive()).toBe(true);
    });

    it('formatea con 2 decimales', () => {
      expect(Money.of(12.5).toString()).toBe('12.50');
    });
  });

  describe('allocate', () => {
    it('reparte en proporción', () => {
      expect(numbers(Money.of(10).allocate(amounts(20, 30)))).toEqual([4, 6]);
    });

    it('no pierde céntimos', () => {
      const parts = Money.of(10).allocate(amounts(1, 1, 1));
      expect(numbers(parts)).toEqual([3.34, 3.33, 3.33]);
      expect(Money.sum(parts).toNumber()).toBe(10);
    });

    it('da los céntimos sobrantes a los mayores restos', () => {
      expect(numbers(Money.of(0.05).allocate(amounts(1, 2, 7)))).toEqual([0.01, 0.01, 0.03]);
    });

    it('ninguna parte supera su peso cuando el importe cubre todo', () => {
      expect(numbers(Money.of(0.02).allocate(amounts(0.01, 0.01)))).toEqual([0.01, 0.01]);
      expect(numbers(Money.of(10).allocate(amounts(9.99, 0.01)))).toEqual([9.99, 0.01]);
    });

    it('un peso cero recibe cero', () => {
      expect(numbers(Money.of(5).allocate(amounts(0, 10)))).toEqual([0, 5]);
    });

    it('repartir cero devuelve ceros, incluso sin pesos', () => {
      expect(numbers(Money.ZERO.allocate(amounts(0, 0)))).toEqual([0, 0]);
    });

    it('rechaza repartir un importe sin pesos', () => {
      expect(() => Money.of(1).allocate(amounts(0, 0))).toThrow(RangeError);
    });
  });
});

import { isUniqueViolation } from './database-errors';

describe('isUniqueViolation', () => {
  it('reconoce una violación de unicidad, de cualquier restricción o de una concreta', () => {
    const error = { code: '23505', constraint: 'idx_a' };
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, 'idx_a')).toBe(true);
    expect(isUniqueViolation(error, 'idx_b')).toBe(false);
  });

  it.each([[{ code: '23503' }], [new Error('x')], [null], [undefined], ['23505']])('no confunde otros errores (%j)', (error) => {
    expect(isUniqueViolation(error)).toBe(false);
  });
});

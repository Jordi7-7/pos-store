import { readFileSync } from 'fs';
import { join } from 'path';
import { ErrorCode } from './error-codes';

describe('ErrorCode', () => {
  const entries = Object.entries(ErrorCode);

  it('cada código es UPPER_SNAKE_CASE y coincide con el nombre del miembro', () => {
    for (const [member, value] of entries) {
      expect(value).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
      expect(value.replace(/_/g, '').toLowerCase()).toBe(member.toLowerCase());
    }
  });

  it('no hay códigos repetidos', () => {
    const values = entries.map(([, value]) => value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('Catálogo documentado', () => {
  it('docs/error-codes.md lista todos los códigos (regenerar con scripts/generate-error-catalog.py)', () => {
    const docs = readFileSync(join(__dirname, '../../../docs/error-codes.md'), 'utf8');
    const missing = Object.values(ErrorCode).filter((code) => !docs.includes(`\`${code}\``));
    expect(missing).toEqual([]);
  });
});

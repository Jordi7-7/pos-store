import { formatInvoiceNumber } from './invoice-number';

describe('formatInvoiceNumber', () => {
  it('rellena con ceros sucursal, caja y secuencia', () => {
    expect(formatInvoiceNumber(2, 13, 457)).toBe('002-013-000000457');
  });

  it('usa 1 cuando la sucursal o la caja no tienen código', () => {
    expect(formatInvoiceNumber(undefined, null, 1)).toBe('001-001-000000001');
    expect(formatInvoiceNumber(0, 0, 1)).toBe('001-001-000000001');
  });
});

import { SqlParams } from './sql-params';

describe('SqlParams', () => {
  it('numera los marcadores en el orden en que se añaden los valores', () => {
    const params = new SqlParams();
    expect(params.add('tenant-1')).toBe('$1');
    expect(params.add(new Date(0))).toBe('$2');
    expect(params.values).toEqual(['tenant-1', new Date(0)]);
  });

  it('values devuelve una copia: modificarla no altera la consulta', () => {
    const params = new SqlParams();
    params.add('a');
    params.values.push('intruso');
    expect(params.values).toEqual(['a']);
  });
});

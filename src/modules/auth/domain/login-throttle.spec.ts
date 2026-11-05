import { accountThrottles, ipThrottle } from './login-throttle';

describe('login-throttle', () => {
  it('el mismo usuario escrito de otra forma comparte contador', () => {
    const a = accountThrottles('t1', ' Ana.Perez ', '1.1.1.1');
    const b = accountThrottles('t1', 'ana.perez', '1.1.1.1');
    expect(a.perAccountFromIp.key).toBe(b.perAccountFromIp.key);
    expect(a.perAccount.key).toBe(b.perAccount.key);
  });

  it('los contadores son distintos por tienda, usuario e IP', () => {
    const base = accountThrottles('t1', 'ana', '1.1.1.1');
    expect(accountThrottles('t2', 'ana', '1.1.1.1').perAccount.key).not.toBe(base.perAccount.key);
    expect(accountThrottles('t1', 'luis', '1.1.1.1').perAccount.key).not.toBe(base.perAccount.key);
    expect(accountThrottles('t1', 'ana', '2.2.2.2').perAccountFromIp.key).not.toBe(base.perAccountFromIp.key);
    expect(accountThrottles('t1', 'ana', '2.2.2.2').perAccount.key).toBe(base.perAccount.key);
  });

  it('un identificador con separadores de clave no puede apuntar al contador de otra cuenta', () => {
    const tricky = accountThrottles('t1', 'ana:1.1.1.1', '9.9.9.9');
    expect(tricky.perAccountFromIp.key).not.toBe(accountThrottles('t1', 'ana', '1.1.1.1').perAccountFromIp.key);
    expect(tricky.perAccount.key).not.toContain(':1.1.1.1');
  });

  it('acota la longitud de la clave aunque el identificador sea enorme', () => {
    expect(accountThrottles('t1', 'x'.repeat(10_000), '1.1.1.1').perAccount.key.length).toBeLessThan(200);
  });

  it('la política por cuenta es más estricta desde una misma IP que en total', () => {
    const { perAccountFromIp, perAccount } = accountThrottles('t1', 'ana', '1.1.1.1');
    expect(perAccountFromIp.maxAttempts).toBeLessThan(perAccount.maxAttempts);
    expect(ipThrottle('1.1.1.1').maxAttempts).toBeGreaterThan(perAccount.maxAttempts);
  });
});

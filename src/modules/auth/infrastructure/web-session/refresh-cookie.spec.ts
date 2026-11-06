import { clearCookieOptions, readCookie, refreshCookieConfig, refreshCookieOptions } from './refresh-cookie';

describe('cookie del refresh token', () => {
  describe('refreshCookieConfig', () => {
    it('por defecto: nombre pos_rt, ruta /auth/web y Secure solo en producción', () => {
      expect(refreshCookieConfig({ NODE_ENV: 'development' })).toEqual({ name: 'pos_rt', path: '/auth/web', secure: false });
      expect(refreshCookieConfig({ NODE_ENV: 'production' }).secure).toBe(true);
    });

    it('se configura por entorno (detrás de Caddy la ruta es /api/auth/web)', () => {
      expect(refreshCookieConfig({ NODE_ENV: 'production', AUTH_COOKIE_PATH: '/api/auth/web', AUTH_COOKIE_NAME: 'sid' })).toEqual({
        name: 'sid',
        path: '/api/auth/web',
        secure: true,
      });
    });

    it('AUTH_COOKIE_SECURE manda sobre NODE_ENV en los dos sentidos', () => {
      expect(refreshCookieConfig({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }).secure).toBe(false);
      expect(refreshCookieConfig({ NODE_ENV: 'development', AUTH_COOKIE_SECURE: 'true' }).secure).toBe(true);
    });
  });

  describe('opciones', () => {
    const config = { name: 'pos_rt', path: '/auth/web', secure: true };

    it('siempre HttpOnly y SameSite=Strict, y vive lo mismo que el token (en milisegundos)', () => {
      expect(refreshCookieOptions(config, 600)).toEqual({ httpOnly: true, secure: true, sameSite: 'strict', path: '/auth/web', maxAge: 600_000 });
    });

    it('para borrarla se repiten ruta y atributos, sin vida', () => {
      expect(clearCookieOptions(config)).toEqual({ httpOnly: true, secure: true, sameSite: 'strict', path: '/auth/web' });
    });
  });

  describe('readCookie', () => {
    it('encuentra la cookie entre otras', () => {
      expect(readCookie('a=1; pos_rt=abc.def.ghi; b=2', 'pos_rt')).toBe('abc.def.ghi');
    });

    it('no confunde nombres que solo se parecen', () => {
      expect(readCookie('xpos_rt=mal; pos_rt_2=mal', 'pos_rt')).toBeUndefined();
    });

    it('sin cabecera, sin la cookie o con valor vacío o mal codificado devuelve undefined', () => {
      expect(readCookie(undefined, 'pos_rt')).toBeUndefined();
      expect(readCookie('a=1', 'pos_rt')).toBeUndefined();
      expect(readCookie('pos_rt=', 'pos_rt')).toBeUndefined();
      expect(readCookie('pos_rt=%E0%A4%A', 'pos_rt')).toBeUndefined();
    });

    it('decodifica el valor', () => {
      expect(readCookie('pos_rt=a%2Bb', 'pos_rt')).toBe('a+b');
    });
  });
});

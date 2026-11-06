import { corsDecision } from './cors.options';

describe('corsDecision', () => {
  describe('con CORS_ORIGINS (producción)', () => {
    const raw = 'https://pos.ejemplo.com, https://admin.ejemplo.com';

    it('un origen de la lista puede llamar con cookies', () => {
      expect(corsDecision(raw, 'https://pos.ejemplo.com')).toEqual({ origin: true, credentials: true });
      expect(corsDecision(raw, 'https://admin.ejemplo.com')).toEqual({ origin: true, credentials: true });
    });

    it('cualquier otro origen queda fuera y sin cookies', () => {
      expect(corsDecision(raw, 'https://malo.com')).toEqual({ origin: false, credentials: false });
      expect(corsDecision(raw, 'https://pos.ejemplo.com.malo.com')).toEqual({ origin: false, credentials: false });
    });

    it('sin cabecera Origin (móvil, curl) no hay CORS que decidir', () => {
      expect(corsDecision(raw, undefined)).toEqual({ origin: false, credentials: false });
    });
  });

  describe('sin CORS_ORIGINS (solo desarrollo)', () => {
    it('localhost lleva cookies', () => {
      for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost']) {
        expect(corsDecision(undefined, origin)).toEqual({ origin: true, credentials: true });
      }
    });

    it('un origen que no es local puede leer, pero nunca con cookies', () => {
      expect(corsDecision(undefined, 'http://192.168.1.20:5173')).toEqual({ origin: true, credentials: false });
      expect(corsDecision('', 'https://localhost.malo.com')).toEqual({ origin: true, credentials: false });
    });
  });
});

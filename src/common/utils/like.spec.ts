import { containsPattern } from './like';

describe('containsPattern', () => {
  it('envuelve el término en comodines y recorta los espacios', () => {
    expect(containsPattern('  camisa ')).toBe('%camisa%');
  });

  it('neutraliza los comodines del usuario', () => {
    expect(containsPattern('100%')).toBe('%100\\%%');
    expect(containsPattern('a_b')).toBe('%a\\_b%');
    expect(containsPattern('%')).toBe('%\\%%');
  });

  it('escapa también la barra invertida', () => {
    expect(containsPattern('a\\b')).toBe('%a\\\\b%');
  });
});

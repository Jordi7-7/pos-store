import { EntityManager } from 'typeorm';
import { lockCashSession } from './cash-session-lock';

describe('lockCashSession', () => {
  const query = jest.fn();
  const manager = { query } as unknown as EntityManager;

  beforeEach(() => query.mockReset());

  it("modo 'share' usa FOR SHARE (varias ventas a la vez)", async () => {
    await lockCashSession(manager, 's1', 'share');
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/FOR SHARE$/), ['s1']);
  });

  it("modo 'update' usa FOR UPDATE (cierre de caja)", async () => {
    await lockCashSession(manager, 's1', 'update');
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/FOR UPDATE$/), ['s1']);
  });
});

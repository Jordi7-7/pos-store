import { AuthTokenService } from '../../../services/auth-token.service';
import { LogoutCommand } from './logout.command';
import { LogoutHandler } from './logout.handler';

describe('LogoutHandler', () => {
  const revokeSession = jest.fn(() => Promise.resolve());
  const handler = new LogoutHandler({ revokeSession } as unknown as AuthTokenService);

  beforeEach(() => revokeSession.mockClear());

  it('revoca la sesión del usuario', async () => {
    await handler.execute(new LogoutCommand('u1'));
    expect(revokeSession).toHaveBeenCalledWith('u1');
  });

  it('sin usuario (ya anónimo) no toca ninguna sesión y no falla', async () => {
    await expect(handler.execute(new LogoutCommand())).resolves.toBeUndefined();
    await expect(handler.execute(new LogoutCommand(null))).resolves.toBeUndefined();
    expect(revokeSession).not.toHaveBeenCalled();
  });
});

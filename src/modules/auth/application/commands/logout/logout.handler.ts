import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutCommand } from './logout.command';
import { AuthTokenService } from '../../../services/auth-token.service';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  private readonly logger = new Logger(LogoutHandler.name);

  constructor(private readonly tokens: AuthTokenService) {}

  async execute(command: LogoutCommand): Promise<void> {
    if (command.userId) {
      this.logger.log(`Logout request for User ID: ${command.userId}`);
      await this.tokens.revokeSession(command.userId);
      this.logger.log(`Session cleared in Redis for User ID: ${command.userId}`);
    } else {
      this.logger.log(`Logout request received without user ID (already anonymous)`);
    }
  }
}

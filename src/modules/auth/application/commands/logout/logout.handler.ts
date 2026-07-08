import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutCommand } from './logout.command';
import { RedisService } from '../../../../../common/redis/redis.service';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  private readonly logger = new Logger(LogoutHandler.name);

  constructor(private readonly redisService: RedisService) {}

  async execute(command: LogoutCommand): Promise<void> {
    this.logger.log(`Logout request for User ID: ${command.userId}`);
    const redisKey = `refresh_token:${command.userId}`;
    await this.redisService.del(redisKey);
    this.logger.log(`Session cleared in Redis for User ID: ${command.userId}`);
  }
}

import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.redisClient = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    this.redisClient.connect().catch((err) => {
      this.logger.warn(`Redis connection error: ${err.message}. Cache-aside will gracefully fallback.`);
    });
  }

  onModuleDestroy() {
    try {
      this.redisClient.disconnect();
    } catch {
      // ignore
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redisClient.get(key);
    } catch (err: any) {
      this.logger.warn(`Redis GET error for key ${key}: ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.redisClient.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.redisClient.set(key, value);
      }
    } catch (err: any) {
      this.logger.warn(`Redis SET error for key ${key}: ${err.message}`);
    }
  }

  /**
   * Incrementa un contador y fija su TTL la primera vez. Devuelve `null` si Redis no
   * está disponible para que el llamador use un respaldo en memoria.
   */
  async incr(key: string, ttlSeconds: number): Promise<number | null> {
    try {
      const value = await this.redisClient.incr(key);
      if (value === 1) {
        await this.redisClient.expire(key, ttlSeconds);
      }
      return value;
    } catch (err: any) {
      this.logger.warn(`Redis INCR error for key ${key}: ${err.message}`);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
    } catch (err: any) {
      this.logger.warn(`Redis DEL error for key ${key}: ${err.message}`);
    }
  }
}

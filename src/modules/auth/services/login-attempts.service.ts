import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

export interface AttemptPolicy {
  /** Clave única del contador (incluye tenant e IP según el caso). */
  key: string;
  /** Fallos permitidos dentro de la ventana antes de bloquear. */
  maxAttempts: number;
  windowSeconds: number;
}

interface MemoryCounter {
  count: number;
  expiresAt: number;
}

/**
 * Cuenta intentos fallidos de autenticación para frenar fuerza bruta. Usa Redis y, si
 * Redis no responde, un contador en memoria del proceso (degradación segura: nunca
 * deja la protección desactivada).
 */
@Injectable()
export class LoginAttemptsService {
  private readonly memory = new Map<string, MemoryCounter>();

  constructor(private readonly redisService: RedisService) {}

  async isLocked(policy: AttemptPolicy): Promise<boolean> {
    const stored = await this.redisService.get(policy.key);
    const redisCount = stored === null ? 0 : Number(stored);
    return Math.max(redisCount, this.memoryCount(policy.key)) >= policy.maxAttempts;
  }

  async registerFailure(policy: AttemptPolicy): Promise<void> {
    const redisCount = await this.redisService.incr(policy.key, policy.windowSeconds);
    if (redisCount === null) {
      this.incrementMemory(policy);
    }
  }

  async reset(key: string): Promise<void> {
    this.memory.delete(key);
    await this.redisService.del(key);
  }

  private memoryCount(key: string): number {
    const entry = this.memory.get(key);
    if (!entry) return 0;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return 0;
    }
    return entry.count;
  }

  private incrementMemory(policy: AttemptPolicy): void {
    const current = this.memoryCount(policy.key);
    const existing = this.memory.get(policy.key);
    this.memory.set(policy.key, {
      count: current + 1,
      expiresAt: existing?.expiresAt ?? Date.now() + policy.windowSeconds * 1000,
    });
  }
}

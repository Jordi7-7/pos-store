import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class HashService {
  async hash(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Gasta el mismo tiempo que una comparación real y siempre devuelve false. Se usa cuando el
   * usuario no existe, para que la respuesta no tarde menos y delate qué cuentas existen.
   */
  async compareAgainstPlaceholder(password: string): Promise<false> {
    this.placeholderHash ??= this.hash(randomBytes(16).toString('hex'));
    await bcrypt.compare(password, await this.placeholderHash);
    return false;
  }

  private placeholderHash?: Promise<string>;
}

import { HttpStatus } from '@nestjs/common';
import { EntityManager, Not } from 'typeorm';
import { User } from '../domain/entities/user.entity';
import { HashService } from '../../auth/services/hash.service';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { isPinInUse } from './pin-uniqueness';

/** Rol que se asigna a un usuario nuevo cuando no se indica ninguno. */
const DEFAULT_ROLE_NAME_PATTERN = '%Cajero%';

/**
 * Reglas de cuenta de usuario que consultan la base de datos, compartidas por crear y editar.
 * Se crea con el `manager` de la transacción en curso y el tenant, de modo que cada
 * comprobación no tenga que recibirlos de nuevo.
 */
export class UserRules {
  constructor(
    private readonly manager: EntityManager,
    private readonly hashService: HashService,
    private readonly tenantId: string,
  ) {}

  /** El nombre de usuario es único por tienda. `exceptUserId` excluye al propio usuario al editar. */
  async assertUsernameAvailable(username: string, exceptUserId?: string): Promise<void> {
    const taken = await this.manager.getRepository(User).findOne({
      where: { tenantId: this.tenantId, username, ...this.otherThan(exceptUserId) },
    });
    if (taken) {
      throw new AppException(ErrorCode.UsernameTaken, `El nombre de usuario "${username}" ya está en uso.`, HttpStatus.CONFLICT, { username });
    }
  }

  /** El correo es opcional; si se informa, es único por tienda. */
  async assertEmailAvailable(email: string | null, exceptUserId?: string): Promise<void> {
    if (!email) return;
    const taken = await this.manager.getRepository(User).findOne({
      where: { tenantId: this.tenantId, email, ...this.otherThan(exceptUserId) },
    });
    if (taken) {
      throw new AppException(ErrorCode.EmailTaken, `El correo "${email}" ya está en uso por otro usuario.`, HttpStatus.CONFLICT, { email });
    }
  }

  /** Id del rol si existe en esta tienda; si no, ROLE_NOT_FOUND. */
  async requireRoleId(roleId: string): Promise<string> {
    const roles: Array<{ id: string }> = await this.manager.query(
      `SELECT id FROM "roles" WHERE "id" = $1 AND "tenant_id" = $2`,
      [roleId, this.tenantId],
    );
    if (roles.length === 0) {
      throw new AppException(ErrorCode.RoleNotFound, 'El rol especificado no existe para esta tienda.', HttpStatus.NOT_FOUND);
    }
    return roles[0].id;
  }

  /** Rol "Cajero" de la tienda, o null si no existe. */
  async defaultRoleId(): Promise<string | null> {
    const roles: Array<{ id: string }> = await this.manager.query(
      `SELECT id FROM "roles" WHERE "tenant_id" = $1 AND "name" ILIKE $2 LIMIT 1`,
      [this.tenantId, DEFAULT_ROLE_NAME_PATTERN],
    );
    return roles[0]?.id ?? null;
  }

  /**
   * Hash de un PIN nuevo. El inicio de sesión por PIN identifica al usuario solo por el PIN,
   * así que no puede repetirse dentro de la tienda. Un PIN vacío significa "sin PIN" (`undefined`).
   */
  async hashAvailablePin(rawPin: string | undefined, exceptUserId?: string): Promise<string | undefined> {
    const pin = rawPin?.trim();
    if (!pin) return undefined;
    if (await isPinInUse(this.manager, this.hashService, this.tenantId, pin, exceptUserId)) {
      throw new AppException(ErrorCode.PinAlreadyInUse, 'Ese PIN ya está en uso por otro usuario.', HttpStatus.CONFLICT);
    }
    return this.hashService.hash(pin);
  }

  private otherThan(userId?: string): { id?: ReturnType<typeof Not<string>> } {
    return userId ? { id: Not(userId) } : {};
  }
}

/** Reemplaza las sucursales asignadas a un usuario con un único INSERT. */
export async function replaceUserBranches(manager: EntityManager, userId: string, branchIds: readonly string[]): Promise<void> {
  await manager.query(`DELETE FROM "user_branches" WHERE "user_id" = $1`, [userId]);
  if (branchIds.length > 0) {
    await manager.query(
      `INSERT INTO "user_branches" ("user_id", "branch_id")
       SELECT $1::uuid, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`,
      [userId, branchIds],
    );
  }
}

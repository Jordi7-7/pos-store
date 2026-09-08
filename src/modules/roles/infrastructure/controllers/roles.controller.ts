import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AuthGuard } from '../../../auth/guards/auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS, PERMISSION_DEFINITIONS, PERMISSION_MODULES } from '../../../../common/enums/permissions.enum';
import { Role } from '../../domain/entities/role.entity';
import { User } from '../../../users/domain/entities/user.entity';
import { CreateRoleDto, UpdateRoleDto } from '../../application/dto/role.dto';

@Controller('roles')
@UseGuards(AuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly entityManager: EntityManager) {}

  @Get('permissions-catalog')
  getPermissionsCatalog() {
    return {
      modules: PERMISSION_MODULES,
      permissions: PERMISSION_DEFINITIONS,
    };
  }

  @Get()
  async listRoles(@CurrentUser('tenantId') tenantId: string) {
    const roleRepo = this.entityManager.getRepository(Role);
    const userRepo = this.entityManager.getRepository(User);

    const roles = await roleRepo.find({
      where: { tenantId },
      order: { isSystem: 'DESC', createdAt: 'ASC' },
    });

    // Conteo de usuarios asignados por rol
    const counts = await userRepo
      .createQueryBuilder('user')
      .select('user.roleId', 'roleId')
      .addSelect('COUNT(user.id)', 'count')
      .where('user.tenantId = :tenantId', { tenantId })
      .groupBy('user.roleId')
      .getRawMany();

    const countMap = new Map<string, number>();
    counts.forEach((c) => countMap.set(c.roleId, Number(c.count)));

    return roles.map((r) => ({
      ...r,
      userCount: countMap.get(r.id) || 0,
    }));
  }

  @Post()
  @RequirePermissions(APP_PERMISSIONS.ROLES_MANAGE)
  async createRole(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateRoleDto,
  ) {
    const roleRepo = this.entityManager.getRepository(Role);

    const existing = await roleRepo.findOne({
      where: { tenantId, name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un rol con el nombre "${dto.name.trim()}".`);
    }

    const role = new Role();
    role.tenantId = tenantId;
    role.name = dto.name.trim();
    role.description = dto.description?.trim() || null;
    role.permissions = dto.permissions || [];
    role.isSystem = false;

    return roleRepo.save(role);
  }

  @Put(':id')
  @RequirePermissions(APP_PERMISSIONS.ROLES_MANAGE)
  async updateRole(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const roleRepo = this.entityManager.getRepository(Role);

    const role = await roleRepo.findOne({
      where: { id, tenantId },
    });
    if (!role) {
      throw new NotFoundException('Rol no encontrado.');
    }

    if (role.isSystem && dto.name && dto.name.trim() !== role.name) {
      // El nombre de los roles de sistema no se modifica para no romper identidades básicas
      throw new BadRequestException('No puedes cambiar el nombre de un rol predeterminado del sistema.');
    }

    if (dto.name && dto.name.trim() !== role.name) {
      const duplicate = await roleRepo.findOne({
        where: { tenantId, name: dto.name.trim() },
      });
      if (duplicate && duplicate.id !== role.id) {
        throw new ConflictException(`Ya existe otro rol con el nombre "${dto.name.trim()}".`);
      }
      role.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      role.description = dto.description?.trim() || null;
    }

    if (dto.permissions !== undefined) {
      // Si es OWNER, sus permisos siempre son ['*']
      if (role.name === 'Propietario') {
        role.permissions = ['*'];
      } else {
        role.permissions = dto.permissions;
      }
    }

    return roleRepo.save(role);
  }

  @Delete(':id')
  @RequirePermissions(APP_PERMISSIONS.ROLES_MANAGE)
  async deleteRole(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const roleRepo = this.entityManager.getRepository(Role);
    const userRepo = this.entityManager.getRepository(User);

    const role = await roleRepo.findOne({
      where: { id, tenantId },
    });
    if (!role) {
      throw new NotFoundException('Rol no encontrado.');
    }

    if (role.isSystem) {
      throw new BadRequestException('Los roles predeterminados del sistema no pueden ser eliminados.');
    }

    const assignedUsers = await userRepo.count({
      where: { tenantId, roleId: role.id },
    });
    if (assignedUsers > 0) {
      throw new BadRequestException(
        `No puedes eliminar este rol porque tiene ${assignedUsers} usuario(s) asignado(s). Reasigna a los usuarios primero.`,
      );
    }

    await roleRepo.remove(role);
    return { success: true, message: 'Rol eliminado con éxito.' };
  }
}

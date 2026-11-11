import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MembershipRole } from '@prisma/client';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { ConversationsController } from './conversations.controller';

/**
 * Los guards de Nest son opt-in. Este test fija que el controller completo
 * —incluido cualquier handler que se agregue después— exige JWT, membresía
 * activa en el negocio y la política de roles, en ese orden.
 */
describe('ConversationsController guards', () => {
  it('applies Jwt → Tenant → Roles at class level', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ConversationsController),
    ).toEqual([JwtGuard, TenantGuard, RolesGuard]);
  });

  it('declares the role policy explicitly at class level', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ConversationsController)).toEqual([
      MembershipRole.OWNER,
      MembershipRole.ADMIN,
      MembershipRole.OPERATOR,
      MembershipRole.VIEWER,
    ]);
  });

  it('no handler overrides the class guards or roles', () => {
    const proto = ConversationsController.prototype as unknown as Record<
      string,
      unknown
    >;
    const handlers = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function',
    );
    expect(handlers.length).toBeGreaterThan(0);
    for (const name of handlers) {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, proto[name] as object),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(ROLES_KEY, proto[name] as object),
      ).toBeUndefined();
    }
  });
});

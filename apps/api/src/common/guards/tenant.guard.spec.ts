import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { TenantGuard } from './tenant.guard';
import type { AuthenticatedRequest } from '../types/request.types';

function createContext(headers: Record<string, string>, user: unknown) {
  // Tipado como `AuthenticatedRequest`: el guard escribe
  // `currentBusinessId`/`currentMembershipRole` sobre este objeto en tiempo
  // de ejecución (y siempre funcionó), pero el literal `{ headers, user }`
  // no declaraba esos campos opcionales — los asserts de abajo no
  // tipaban, aunque el test corría bien.
  const request = { headers, user } as unknown as AuthenticatedRequest;

  return {
    request,
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext,
  };
}

describe('TenantGuard impersonation', () => {
  it('allows a platform admin impersonation token without membership lookup', async () => {
    const prisma = {
      membership: {
        findUnique: jest.fn(),
      },
    };
    const guard = new TenantGuard(prisma as never);
    const { context, request } = createContext(
      {},
      {
        id: 'admin-1',
        isPlatformAdmin: true,
        isImpersonating: true,
        impersonatedBusinessId: 'biz-1',
      },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    expect(request.currentBusinessId).toBe('biz-1');
    expect(request.currentMembershipRole).toBe(MembershipRole.OWNER);
  });

  it('rejects mismatched x-business-id during impersonation', async () => {
    const guard = new TenantGuard({
      membership: { findUnique: jest.fn() },
    } as never);
    const { context } = createContext(
      { 'x-business-id': 'other-biz' },
      {
        id: 'admin-1',
        isPlatformAdmin: true,
        isImpersonating: true,
        impersonatedBusinessId: 'biz-1',
      },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

import { PlatformAdminGuard } from './platform-admin.guard';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

function createMockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('allows access when user isPlatformAdmin is true', () => {
    const ctx = createMockContext({
      id: 'u1',
      email: 'admin@test.com',
      isPlatformAdmin: true,
      isActive: true,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when user isPlatformAdmin is false', () => {
    const ctx = createMockContext({
      id: 'u2',
      email: 'user@test.com',
      isPlatformAdmin: false,
      isActive: true,
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is missing', () => {
    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is null', () => {
    const ctx = createMockContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

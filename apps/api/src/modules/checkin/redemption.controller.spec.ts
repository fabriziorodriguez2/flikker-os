import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtGuard } from '../auth/guards/jwt.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';

const noopGuard = { canActivate: () => true };
const USER_ID = 'usr-1';

const mockService = {
  preview: jest.fn(),
  redeem: jest.fn(),
};

function fakeReq(): AuthenticatedRequest {
  return {
    user: {
      id: USER_ID,
      email: 'staff@test.com',
      firstName: 'Staff',
      lastName: 'User',
      isActive: true,
      isPlatformAdmin: false,
    },
  } as AuthenticatedRequest;
}

describe('RedemptionController', () => {
  let controller: RedemptionController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedemptionController],
      providers: [{ provide: RedemptionService, useValue: mockService }],
    })
      .overrideGuard(JwtGuard)
      .useValue(noopGuard)
      .overrideGuard(ThrottlerGuard)
      .useValue(noopGuard)
      .compile();

    controller = module.get<RedemptionController>(RedemptionController);
  });

  // Hardening pre-piloto — regresión: si algún refactor futuro sacara el
  // guard sin querer, este test lo detecta sin depender de contar requests
  // reales contra el ThrottlerStorage (eso ya lo prueba @nestjs/throttler
  // mismo, no hace falta reprobarlo acá).
  it('guards both endpoints with JwtGuard and ThrottlerGuard', () => {
    const guards: unknown[] = Reflect.getMetadata(
      GUARDS_METADATA,
      RedemptionController,
    );
    expect(guards).toContain(JwtGuard);
    expect(guards).toContain(ThrottlerGuard);
  });

  it('preview() delegates to the service with the caller id', async () => {
    mockService.preview.mockResolvedValue({
      benefitTitle: 'Capuccino gratis',
      customerName: 'Ana',
    });

    const result = await controller.preview(fakeReq(), { code: 'abcd1234' });

    expect(result.benefitTitle).toBe('Capuccino gratis');
    expect(mockService.preview).toHaveBeenCalledWith(USER_ID, 'abcd1234');
  });

  it('redeem() delegates to the service with the caller id', async () => {
    mockService.redeem.mockResolvedValue({
      ok: true,
      customerName: 'Ana',
      benefitTitle: 'Capuccino gratis',
      visitId: 'visit-1',
    });

    const result = await controller.redeem(fakeReq(), { code: 'abcd1234' });

    expect(result.ok).toBe(true);
    expect(mockService.redeem).toHaveBeenCalledWith(USER_ID, 'abcd1234');
  });
});

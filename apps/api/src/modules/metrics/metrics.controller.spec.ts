import { Test, TestingModule } from '@nestjs/testing';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

const noopGuard = { canActivate: () => true };
const BUSINESS_ID = 'biz-1';

const mockService = {
  getOverview: jest.fn(),
  acknowledgeNegativeFeedback: jest.fn(),
};

function fakeReq(
  overrides?: Partial<AuthenticatedRequest>,
): AuthenticatedRequest {
  return {
    currentBusinessId: BUSINESS_ID,
    user: {
      id: 'usr-1',
      email: 'test@test.com',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      isPlatformAdmin: false,
    },
    ...overrides,
  } as AuthenticatedRequest;
}

describe('MetricsController', () => {
  let controller: MetricsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: mockService }],
    })
      .overrideGuard(JwtGuard)
      .useValue(noopGuard)
      .overrideGuard(TenantGuard)
      .useValue(noopGuard)
      .compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('returns overview for the current business', async () => {
    mockService.getOverview.mockResolvedValue({ ok: true });

    const result = await controller.overview(fakeReq());

    expect(result).toEqual({ ok: true });
    expect(mockService.getOverview).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it('acknowledges negative feedback for the current business', async () => {
    mockService.acknowledgeNegativeFeedback.mockResolvedValue({
      id: 'feedback-1',
      acknowledgedByOwner: true,
    });

    const result = await controller.acknowledgeFeedback(
      fakeReq(),
      'feedback-1',
    );

    expect(result).toEqual({
      id: 'feedback-1',
      acknowledgedByOwner: true,
    });
    expect(mockService.acknowledgeNegativeFeedback).toHaveBeenCalledWith(
      BUSINESS_ID,
      'feedback-1',
    );
  });
});

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

    const result = await controller.overview(fakeReq(), { days: 30 });

    expect(result).toEqual({ ok: true });
    expect(mockService.getOverview).toHaveBeenCalledWith(BUSINESS_ID, 30);
  });
});

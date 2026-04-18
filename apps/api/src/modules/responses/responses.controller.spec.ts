import { Test, TestingModule } from '@nestjs/testing';
import { ResponsesController } from './responses.controller';
import { ResponsesService } from './responses.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';

const noopGuard = { canActivate: () => true };
const BUSINESS_ID = 'biz-1';
const REVIEW_ID = 'rev-1';
const RESPONSE_ID = 'res-1';
const USER_ID = 'usr-1';

const mockResponse = {
  id: RESPONSE_ID,
  businessId: BUSINESS_ID,
  reviewId: REVIEW_ID,
  content: 'Thanks for visiting',
  respondedAt: new Date(),
  respondedByUserId: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockService = {
  create: jest.fn(),
  findByReview: jest.fn(),
  update: jest.fn(),
};

function fakeReq(
  overrides?: Partial<AuthenticatedRequest>,
): AuthenticatedRequest {
  return {
    currentBusinessId: BUSINESS_ID,
    user: {
      id: USER_ID,
      email: 'test@test.com',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      isPlatformAdmin: false,
    },
    ...overrides,
  } as AuthenticatedRequest;
}

describe('ResponsesController', () => {
  let controller: ResponsesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResponsesController],
      providers: [{ provide: ResponsesService, useValue: mockService }],
    })
      .overrideGuard(JwtGuard)
      .useValue(noopGuard)
      .overrideGuard(TenantGuard)
      .useValue(noopGuard)
      .overrideGuard(RolesGuard)
      .useValue(noopGuard)
      .compile();

    controller = module.get<ResponsesController>(ResponsesController);
  });

  it('creates a response with current tenant and user', async () => {
    mockService.create.mockResolvedValue(mockResponse);

    const result = await controller.create(fakeReq(), {
      reviewId: REVIEW_ID,
      content: 'Thanks for visiting',
    });

    expect(result.id).toBe(RESPONSE_ID);
    expect(mockService.create).toHaveBeenCalledWith(
      BUSINESS_ID,
      { reviewId: REVIEW_ID, content: 'Thanks for visiting' },
      USER_ID,
    );
  });

  it('returns a response by review', async () => {
    mockService.findByReview.mockResolvedValue(mockResponse);

    const result = await controller.findByReview(fakeReq(), REVIEW_ID);

    expect(result.reviewId).toBe(REVIEW_ID);
    expect(mockService.findByReview).toHaveBeenCalledWith(
      BUSINESS_ID,
      REVIEW_ID,
    );
  });

  it('updates a response with current tenant and user', async () => {
    mockService.update.mockResolvedValue({
      ...mockResponse,
      content: 'Updated response',
    });

    const result = await controller.update(fakeReq(), RESPONSE_ID, {
      content: 'Updated response',
    });

    expect(result.content).toBe('Updated response');
    expect(mockService.update).toHaveBeenCalledWith(
      BUSINESS_ID,
      RESPONSE_ID,
      { content: 'Updated response' },
      USER_ID,
    );
  });
});

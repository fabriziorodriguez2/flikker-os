import { Test, TestingModule } from '@nestjs/testing';
import { WidgetStatus, WidgetType } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { WidgetsController } from './widgets.controller';
import { WidgetsPublicController } from './widgets-public.controller';
import { WidgetsService } from './widgets.service';

const noopGuard = { canActivate: () => true };
const BUSINESS_ID = 'biz-1';
const WIDGET_ID = 'widget-1';
const USER_ID = 'usr-1';
const PUBLIC_TOKEN = 'public-token';

const mockWidget = {
  id: WIDGET_ID,
  businessId: BUSINESS_ID,
  name: 'Main widget',
  status: WidgetStatus.DRAFT,
  type: WidgetType.REVIEW_LIST,
  publicToken: PUBLIC_TOKEN,
  title: 'What customers say',
  maxItems: 6,
  showAuthorName: true,
  showDate: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockService = {
  listForBusiness: jest.fn(),
  findOneScoped: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  getEmbedInfo: jest.fn(),
  getPublicWidget: jest.fn(),
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

describe('WidgetsController', () => {
  let controller: WidgetsController;
  let publicController: WidgetsPublicController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WidgetsController, WidgetsPublicController],
      providers: [{ provide: WidgetsService, useValue: mockService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue(noopGuard)
      .overrideGuard(JwtGuard)
      .useValue(noopGuard)
      .overrideGuard(TenantGuard)
      .useValue(noopGuard)
      .overrideGuard(RolesGuard)
      .useValue(noopGuard)
      .compile();

    controller = module.get<WidgetsController>(WidgetsController);
    publicController = module.get<WidgetsPublicController>(
      WidgetsPublicController,
    );
  });

  it('lists widgets for the current business', async () => {
    mockService.listForBusiness.mockResolvedValue([mockWidget]);

    const result = await controller.list(fakeReq());

    expect(result).toEqual([mockWidget]);
    expect(mockService.listForBusiness).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it('creates a widget scoped to the current business', async () => {
    mockService.create.mockResolvedValue(mockWidget);

    const dto = {
      name: 'Main widget',
      type: WidgetType.REVIEW_LIST,
      title: 'What customers say',
      maxItems: 6,
      showAuthorName: true,
      showDate: true,
    };
    const result = await controller.create(fakeReq(), dto);

    expect(result.id).toBe(WIDGET_ID);
    expect(mockService.create).toHaveBeenCalledWith(BUSINESS_ID, dto);
  });

  it('updates a widget', async () => {
    mockService.update.mockResolvedValue({ ...mockWidget, title: 'Updated' });

    const result = await controller.update(fakeReq(), WIDGET_ID, {
      title: 'Updated',
    });

    expect(result.title).toBe('Updated');
    expect(mockService.update).toHaveBeenCalledWith(BUSINESS_ID, WIDGET_ID, {
      title: 'Updated',
    });
  });

  it('updates widget status', async () => {
    mockService.updateStatus.mockResolvedValue({
      ...mockWidget,
      status: WidgetStatus.ACTIVE,
    });

    const result = await controller.updateStatus(fakeReq(), WIDGET_ID, {
      status: WidgetStatus.ACTIVE,
    });

    expect(result.status).toBe(WidgetStatus.ACTIVE);
    expect(mockService.updateStatus).toHaveBeenCalledWith(
      BUSINESS_ID,
      WIDGET_ID,
      { status: WidgetStatus.ACTIVE },
    );
  });

  it('returns embed info for a widget', async () => {
    mockService.getEmbedInfo.mockResolvedValue({
      widgetId: WIDGET_ID,
      publicToken: PUBLIC_TOKEN,
      publicUrl: `http://localhost:3000/public/widgets/${PUBLIC_TOKEN}`,
      embedType: 'feed',
    });

    const result = await controller.getEmbedInfo(fakeReq(), WIDGET_ID);

    expect(result.widgetId).toBe(WIDGET_ID);
    expect(mockService.getEmbedInfo).toHaveBeenCalledWith(
      BUSINESS_ID,
      WIDGET_ID,
    );
  });

  it('returns public widget payload by token', async () => {
    mockService.getPublicWidget.mockResolvedValue({
      widget: {
        type: WidgetType.BADGE,
        title: 'Trusted by customers',
        showAuthorName: true,
        showDate: false,
        maxItems: 6,
      },
      summary: {
        averageRating: 4.7,
        totalReviews: 8,
        businessName: 'Gains Montevideo',
      },
      reviews: [],
    });

    const result = await publicController.getPublicWidget(PUBLIC_TOKEN);

    expect(result.summary.businessName).toBe('Gains Montevideo');
    expect(mockService.getPublicWidget).toHaveBeenCalledWith(PUBLIC_TOKEN);
  });
});

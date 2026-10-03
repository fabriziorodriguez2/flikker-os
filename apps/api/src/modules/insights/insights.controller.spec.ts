import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import type { PlansService } from '../plans/plans.service';
import type { BusinessInsightSummaryService } from './business-insight-summary.service';
import { InsightsController } from './insights.controller';
import type { InsightsService } from './insights.service';

function setup(pro: boolean) {
  const insights = {
    getBusinessOverview: jest.fn().mockResolvedValue({ ok: true }),
  };
  const summary = {
    getSummary: jest.fn().mockResolvedValue({ summary: true }),
  };
  const plans = {
    assertProPlanAccess: jest
      .fn()
      .mockImplementation(() =>
        pro
          ? Promise.resolve()
          : Promise.reject(new ForbiddenException('Flikker Pro')),
      ),
  };
  const controller = new InsightsController(
    insights as unknown as InsightsService,
    summary as unknown as BusinessInsightSummaryService,
    plans as unknown as PlansService,
  );
  const req = { currentBusinessId: 'biz-1' } as AuthenticatedRequest;
  return { controller, insights, summary, plans, req };
}

describe('InsightsController — gate Pro', () => {
  it('FREE recibe 403 y no consulta analytics', async () => {
    const { controller, insights, req } = setup(false);

    await expect(controller.overview(req)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(insights.getBusinessOverview).not.toHaveBeenCalled();
  });

  it('PRO conserva overview y resumen completos', async () => {
    const { controller, insights, summary, req } = setup(true);

    await expect(controller.overview(req)).resolves.toEqual({ ok: true });
    await expect(controller.getSummary(req)).resolves.toEqual({
      summary: true,
    });
    await expect(controller.refreshSummary(req)).resolves.toEqual({
      summary: true,
    });
    expect(insights.getBusinessOverview).toHaveBeenCalledWith('biz-1');
    expect(summary.getSummary).toHaveBeenLastCalledWith('biz-1', {
      forceRefresh: true,
    });
  });
});

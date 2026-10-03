import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import type { PlansService } from '../plans/plans.service';
import { NotificationsController } from './notifications.controller';
import type { NotificationsPromotionsService } from './notifications-promotions.service';
import type { NotificationsService } from './notifications.service';

function setup(pro: boolean) {
  const notifications = {
    history: jest.fn().mockResolvedValue([{ id: 'message-1' }]),
  };
  const promotions = {};
  const plans = {
    assertProPlanAccess: jest
      .fn()
      .mockImplementation(() =>
        pro
          ? Promise.resolve()
          : Promise.reject(new ForbiddenException('Flikker Pro')),
      ),
  };
  const controller = new NotificationsController(
    notifications as unknown as NotificationsService,
    promotions as unknown as NotificationsPromotionsService,
    plans as unknown as PlansService,
  );
  const req = { currentBusinessId: 'biz-1' } as AuthenticatedRequest;
  return { controller, notifications, plans, req };
}

describe('NotificationsController.history — gate Pro', () => {
  it('FREE recibe 403 y no consulta el historial', async () => {
    const { controller, notifications, req } = setup(false);

    await expect(controller.history(req)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(notifications.history).not.toHaveBeenCalled();
  });

  it('PRO recibe el historial normal', async () => {
    const { controller, notifications, req } = setup(true);

    await expect(controller.history(req)).resolves.toEqual([
      { id: 'message-1' },
    ]);
    expect(notifications.history).toHaveBeenCalledWith('biz-1');
  });
});

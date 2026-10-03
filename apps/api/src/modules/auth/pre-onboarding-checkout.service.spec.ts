import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CheckoutLeadStatus } from '@prisma/client';
import { PreOnboardingCheckoutService } from './pre-onboarding-checkout.service';

/**
 * Parte 5D — checkout Pro ANTES de que exista un Business. Lo que importa
 * acá: nunca se acepta si falta verificar el correo, si el User ya tiene un
 * negocio (ese camino es `POST /businesses/current/checkout`), o si el plan
 * pedido no coincide con la intención real guardada en el User. El GET de
 * status reconcilia con la MISMA lógica del webhook — nunca un search ni
 * una heurística propia.
 */
describe('PreOnboardingCheckoutService', () => {
  const USER_ID = 'user-1';
  const VERIFIED_USER = {
    id: USER_ID,
    email: 'ana@ejemplo.com',
    pendingUpgradePlan: 'MONTHLY',
    emailVerifiedAt: new Date('2026-01-01'),
    notificationWhatsapp: '+59899123456',
  };

  function makeRepository() {
    return {
      findUserById: jest.fn().mockResolvedValue(VERIFIED_USER),
      findMembershipsForUser: jest.fn().mockResolvedValue([]),
      findInProgressPreOnboardingCheckoutLead: jest
        .fn()
        .mockResolvedValue(null),
      createPreOnboardingCheckoutLead: jest
        .fn()
        .mockResolvedValue({ id: 'lead-new' }),
      findLatestPreOnboardingCheckoutLead: jest.fn(),
      findCheckoutLeadById: jest.fn(),
    };
  }

  function makeCheckoutLeads() {
    return {
      createCheckout: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://mp.test/checkout/new',
        status: 'CHECKOUT_CREATED',
      }),
    };
  }

  function makeWebhook() {
    return {
      handleSubscriptionPreapproval: jest.fn().mockResolvedValue(undefined),
    };
  }

  function makeService(
    repository: ReturnType<typeof makeRepository>,
    checkoutLeads: ReturnType<typeof makeCheckoutLeads>,
    webhook: ReturnType<typeof makeWebhook>,
  ) {
    return new PreOnboardingCheckoutService(
      repository as never,
      checkoutLeads as never,
      webhook as never,
    );
  }

  describe('createCheckout', () => {
    it('usuario verificado, sin negocio, plan coincide con la intención: crea el checkout', async () => {
      const repository = makeRepository();
      const checkoutLeads = makeCheckoutLeads();
      const service = makeService(repository, checkoutLeads, makeWebhook());

      const result = await service.createCheckout(USER_ID, 'MONTHLY' as never);

      expect(repository.createPreOnboardingCheckoutLead).toHaveBeenCalledWith({
        requestedByUserId: USER_ID,
        email: VERIFIED_USER.email,
        plan: 'MONTHLY',
      });
      expect(checkoutLeads.createCheckout).toHaveBeenCalledWith('lead-new');
      expect(result).toEqual({
        checkoutUrl: 'https://mp.test/checkout/new',
        status: 'CHECKOUT_CREATED',
      });
    });

    it('correo sin verificar: rechaza, nunca llega a tocar CheckoutLead', async () => {
      const repository = makeRepository();
      repository.findUserById.mockResolvedValue({
        ...VERIFIED_USER,
        emailVerifiedAt: null,
      });
      const checkoutLeads = makeCheckoutLeads();
      const service = makeService(repository, checkoutLeads, makeWebhook());

      await expect(
        service.createCheckout(USER_ID, 'MONTHLY' as never),
      ).rejects.toThrow(ForbiddenException);
      expect(checkoutLeads.createCheckout).not.toHaveBeenCalled();
    });

    it('usuario que YA tiene un negocio (Membership existente): rechaza — ese camino es el upgrade autenticado', async () => {
      const repository = makeRepository();
      repository.findMembershipsForUser.mockResolvedValue([
        { businessId: 'biz-1', role: 'OWNER' },
      ]);
      const checkoutLeads = makeCheckoutLeads();
      const service = makeService(repository, checkoutLeads, makeWebhook());

      await expect(
        service.createCheckout(USER_ID, 'MONTHLY' as never),
      ).rejects.toThrow(ConflictException);
      expect(checkoutLeads.createCheckout).not.toHaveBeenCalled();
    });

    it('plan pedido distinto de pendingUpgradePlan: rechaza — nunca confía en lo que mandó el browser', async () => {
      const repository = makeRepository();
      const checkoutLeads = makeCheckoutLeads();
      const service = makeService(repository, checkoutLeads, makeWebhook());

      await expect(
        service.createCheckout(USER_ID, 'YEARLY' as never),
      ).rejects.toThrow(ConflictException);
      expect(checkoutLeads.createCheckout).not.toHaveBeenCalled();
    });

    it('sin notificationWhatsapp: rechaza — el checkout nunca arranca sin WhatsApp (Parte 5E)', async () => {
      const repository = makeRepository();
      repository.findUserById.mockResolvedValue({
        ...VERIFIED_USER,
        notificationWhatsapp: null,
      });
      const checkoutLeads = makeCheckoutLeads();
      const service = makeService(repository, checkoutLeads, makeWebhook());

      await expect(
        service.createCheckout(USER_ID, 'MONTHLY' as never),
      ).rejects.toThrow(ConflictException);
      expect(checkoutLeads.createCheckout).not.toHaveBeenCalled();
    });

    it('sin pendingUpgradePlan (signup normal, nunca eligió Pro): rechaza cualquier plan', async () => {
      const repository = makeRepository();
      repository.findUserById.mockResolvedValue({
        ...VERIFIED_USER,
        pendingUpgradePlan: null,
      });
      const checkoutLeads = makeCheckoutLeads();
      const service = makeService(repository, checkoutLeads, makeWebhook());

      await expect(
        service.createCheckout(USER_ID, 'MONTHLY' as never),
      ).rejects.toThrow(ConflictException);
    });

    it('usuario inexistente: 404', async () => {
      const repository = makeRepository();
      repository.findUserById.mockResolvedValue(null);
      const service = makeService(
        repository,
        makeCheckoutLeads(),
        makeWebhook(),
      );

      await expect(
        service.createCheckout(USER_ID, 'MONTHLY' as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('con un lead en curso del mismo plan: lo reusa, nunca crea uno nuevo', async () => {
      const repository = makeRepository();
      repository.findInProgressPreOnboardingCheckoutLead.mockResolvedValue({
        id: 'lead-existing',
      });
      const checkoutLeads = makeCheckoutLeads();
      const service = makeService(repository, checkoutLeads, makeWebhook());

      await service.createCheckout(USER_ID, 'MONTHLY' as never);

      expect(repository.createPreOnboardingCheckoutLead).not.toHaveBeenCalled();
      expect(checkoutLeads.createCheckout).toHaveBeenCalledWith(
        'lead-existing',
      );
    });
  });

  describe('getStatus', () => {
    it('sin ningún checkout todavía: status/plan/businessId todos null', async () => {
      const repository = makeRepository();
      repository.findLatestPreOnboardingCheckoutLead.mockResolvedValue(null);
      const service = makeService(
        repository,
        makeCheckoutLeads(),
        makeWebhook(),
      );

      expect(await service.getStatus(USER_ID)).toEqual({
        status: null,
        plan: null,
        businessId: null,
      });
    });

    it('PAID: lo devuelve tal cual, sin tocar el webhook de reconciliación', async () => {
      const repository = makeRepository();
      repository.findLatestPreOnboardingCheckoutLead.mockResolvedValue({
        id: 'lead-1',
        status: CheckoutLeadStatus.PAID,
        plan: 'MONTHLY',
        businessId: null,
        providerSubscriptionId: 'sub-1',
      });
      const webhook = makeWebhook();
      const service = makeService(repository, makeCheckoutLeads(), webhook);

      const result = await service.getStatus(USER_ID);

      expect(webhook.handleSubscriptionPreapproval).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: CheckoutLeadStatus.PAID,
        plan: 'MONTHLY',
        businessId: null,
      });
    });

    it('CHECKOUT_CREATED con subscription asociada: reconcilia con la MISMA lógica del webhook antes de responder', async () => {
      const repository = makeRepository();
      repository.findLatestPreOnboardingCheckoutLead.mockResolvedValue({
        id: 'lead-1',
        status: CheckoutLeadStatus.CHECKOUT_CREATED,
        plan: 'MONTHLY',
        businessId: null,
        providerSubscriptionId: 'sub-1',
      });
      // Releído por id (no por "pre-onboarding del User") después de
      // reconciliar — ver el comentario en `getStatus`. Ya está PAID.
      repository.findCheckoutLeadById.mockResolvedValue({
        id: 'lead-1',
        status: CheckoutLeadStatus.PAID,
        plan: 'MONTHLY',
        businessId: null,
        providerSubscriptionId: 'sub-1',
      });
      const webhook = makeWebhook();
      const service = makeService(repository, makeCheckoutLeads(), webhook);

      const result = await service.getStatus(USER_ID);

      expect(webhook.handleSubscriptionPreapproval).toHaveBeenCalledWith(
        'sub-1',
      );
      expect(result.status).toBe(CheckoutLeadStatus.PAID);
    });

    it('carrera real: el lead se asoció a un Business justo durante la reconciliación — igual se reporta correctamente (releído por id, no por el filtro "sin Business")', async () => {
      const repository = makeRepository();
      repository.findLatestPreOnboardingCheckoutLead.mockResolvedValue({
        id: 'lead-1',
        status: CheckoutLeadStatus.CHECKOUT_CREATED,
        plan: 'MONTHLY',
        businessId: null,
        providerSubscriptionId: 'sub-1',
      });
      // El onboarding ya lo asoció a un Business en el medio — el filtro
      // "pre-onboarding" (`businessId: null`) ya no lo encontraría, pero
      // la búsqueda por id sí.
      repository.findCheckoutLeadById.mockResolvedValue({
        id: 'lead-1',
        status: CheckoutLeadStatus.PAID,
        plan: 'MONTHLY',
        businessId: 'biz-recien-creado',
        providerSubscriptionId: 'sub-1',
      });
      const service = makeService(
        repository,
        makeCheckoutLeads(),
        makeWebhook(),
      );

      const result = await service.getStatus(USER_ID);

      expect(result).toEqual({
        status: CheckoutLeadStatus.PAID,
        plan: 'MONTHLY',
        businessId: 'biz-recien-creado',
      });
    });

    it('CHECKOUT_CREATED sin providerSubscriptionId todavía: no intenta reconciliar (nada que pedirle a MP)', async () => {
      const repository = makeRepository();
      repository.findLatestPreOnboardingCheckoutLead.mockResolvedValue({
        id: 'lead-1',
        status: CheckoutLeadStatus.CHECKOUT_CREATING,
        plan: 'MONTHLY',
        businessId: null,
        providerSubscriptionId: null,
      });
      const webhook = makeWebhook();
      const service = makeService(repository, makeCheckoutLeads(), webhook);

      await service.getStatus(USER_ID);

      expect(webhook.handleSubscriptionPreapproval).not.toHaveBeenCalled();
    });
  });
});

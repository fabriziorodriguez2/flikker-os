/**
 * Reproducible LOCAL end-to-end run of the Fase E §40 UX case — the primary
 * scan → progress → unlock loop, plus the global "Mi Flikker" account.
 *
 * Scenario, exactly as specified:
 *   1. Cliente escanea Café A por primera vez → se crea Visit.
 *   2. El flujo de review sigue funcionando (forceReviewPrompt en el registro).
 *   3. Reward Engine crea goal: "1 visita más → upgrade".
 *   4. (Mi Flikker) el cliente vería Café A, 0/1 hacia el upgrade.
 *   5-8. Vuelve y escanea → nueva Visit válida → goal ACTIVE → UNLOCKED →
 *        se crea BenefitParticipation.
 *   9-11. Mi Flikker muestra la recompensa disponible.
 *   12-14. El cliente verifica su teléfono (OTP) — la forma segura de
 *        reconocerlo como la misma identidad global que ya diseñamos — y Bar
 *        B, donde también visitó, queda agregado a su cuenta.
 *   15-16. Café A y Bar B mantienen visitas/progreso independientes; ninguno
 *        puede ver la actividad del otro.
 *
 * Usage (from apps/api, against the LOCAL database):
 *   npx ts-node -r tsconfig-paths/register scripts/reward-goals-ux-e2e-local.ts
 *
 * Refuses to run against anything that is not localhost. Cleans up everything
 * it created, even on failure.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ExperienceVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { FlikkerAccountService } from '../src/modules/flikker-account/flikker-account.service';
import { FlikkerAccountVerificationsRepository } from '../src/modules/flikker-account/flikker-account-verifications.repository';
import { MyFlikkerService } from '../src/modules/flikker-account/my-flikker.service';
import { normalizeToE164 } from '../src/common/utils/phone.util';

const SUFFIX = Date.now();
const SHARED_PHONE = '099' + String(SUFFIX).slice(-6);
const SHARED_PHONE_E164 = normalizeToE164(SHARED_PHONE);

function assert(condition: boolean, label: string) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) throw new Error(`FAILED: ${label}`);
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('Refusing to run: DATABASE_URL is not a local database');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const checkin = app.get(CheckinService);
  const accounts = app.get(FlikkerAccountService);
  const accountVerifications = app.get(FlikkerAccountVerificationsRepository);
  const myFlikker = app.get(MyFlikkerService);

  let businessAId = '';
  let businessBId = '';

  try {
    console.log('\n=== SEED: Café A ===');
    const businessA = await prisma.business.create({
      data: {
        name: 'Café A',
        slug: `ux-e2e-cafe-a-${SUFFIX}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        checkinMinHoursBetweenVisits: 0, // so the "scan again" step is never dedup-blocked
        checkinMaxVisitsPerDay: 10,
      },
      select: { id: true },
    });
    businessAId = businessA.id;
    await prisma.retentionSettings.create({
      data: { businessId: businessAId, rewardGoalsEnabled: true },
    });
    await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: businessAId,
        name: 'Upgrade gratis',
        type: 'gift',
        active: true,
        rewardGoalEligible: true,
        expiresInDays: 14,
      },
    });
    const sourceA = await prisma.visitSource.create({
      data: {
        businessId: businessAId,
        name: 'QR mostrador',
        token: `tok-a-${SUFFIX}`,
      },
      select: { token: true },
    });
    console.log(
      '  business + reward-goal-eligible incentive + QR source ready',
    );

    console.log('\n=== 1-3. Primer escaneo en Café A ===');
    const registerResult = await checkin.register(sourceA.token, {
      name: 'Ana Pérez',
      phone: SHARED_PHONE,
    });
    assert(registerResult.status === 'registered', 'primera visita registrada');
    if (registerResult.status !== 'registered') throw new Error('unreachable');

    assert(
      registerResult.personal.reviewPrompt.show === true,
      'el flujo de reseña sigue pidiendo review en la primera visita (Fase E §16)',
    );
    assert(
      registerResult.personal.rewardGoal.goal?.targetAdditionalVisits === 1,
      'Reward Engine creó la meta "1 visita más → upgrade"',
    );
    assert(
      registerResult.personal.rewardGoal.goal?.progressVisits === 0,
      'progreso arranca en 0 — ninguna visita anterior a la meta cuenta',
    );

    console.log('\n=== 4. Mi Flikker mostraría 0/1 en Café A ===');
    // Not yet linked to a global account — this is what §12-14 verifies below.

    console.log('\n=== 5-8. Vuelve y escanea de nuevo ===');
    const checkinResult = await checkin.checkin(
      sourceA.token,
      registerResult.sessionToken,
    );
    assert(
      checkinResult.status === 'checked_in',
      'segunda visita registrada (Visit válida)',
    );
    assert(
      checkinResult.personal.rewardGoal.unlockedNow === true,
      'la meta pasó ACTIVE → UNLOCKED',
    );
    assert(
      Boolean(checkinResult.personal.rewardGoal.benefit?.code),
      'se emitió una BenefitParticipation con código de canje',
    );
    console.log(`  código: ${checkinResult.personal.rewardGoal.benefit?.code}`);

    console.log(
      '\n=== SEED: Bar B (visita previa, todavía sin cuenta global) ===',
    );
    const businessB = await prisma.business.create({
      data: {
        name: 'Bar B',
        slug: `ux-e2e-bar-b-${SUFFIX}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        checkinMinHoursBetweenVisits: 0,
        checkinMaxVisitsPerDay: 10,
      },
      select: { id: true },
    });
    businessBId = businessB.id;
    const sourceB = await prisma.visitSource.create({
      data: {
        businessId: businessBId,
        name: 'QR mostrador',
        token: `tok-b-${SUFFIX}`,
      },
      select: { token: true },
    });

    console.log('\n=== 12. Cliente escanea Bar B por primera vez ===');
    const registerB = await checkin.register(sourceB.token, {
      name: 'Ana Pérez',
      phone: SHARED_PHONE,
    });
    assert(
      registerB.status === 'registered',
      'primera visita en Bar B registrada',
    );

    console.log(
      '\n=== 12-14. Verificación global (la forma SEGURA de "reconocerlo") ===',
    );
    // Per the identity design: linking to a global account requires proving
    // phone ownership by OTP — never a phone merely typed at registration.
    const { code } = await accountVerifications.start(SHARED_PHONE_E164);
    assert(Boolean(code), 'código de verificación generado');
    const session = await accounts.verifyAndIssueSession(SHARED_PHONE, code!);
    assert(Boolean(session.flikkerAccountId), 'cuenta global creada/vinculada');

    console.log('\n=== Mi Flikker: Café A y Bar B, ambos agregados ===');
    const places = await myFlikker.listPlaces(session.flikkerAccountId);
    assert(places.length === 2, 'Mi Flikker muestra los dos negocios');
    const cafeA = places.find((p) => p.businessId === businessAId);
    const barB = places.find((p) => p.businessId === businessBId);
    assert(Boolean(cafeA), 'Café A está en la lista');
    assert(Boolean(barB), 'Bar B está en la lista');
    assert(
      cafeA?.benefitAvailable?.name === 'Upgrade gratis',
      'Mi Flikker muestra la recompensa desbloqueada en Café A',
    );

    console.log(
      '\n=== 15-16. Progreso independiente — ningún negocio ve al otro ===',
    );
    assert(cafeA!.visitsTotal === 2, 'Café A: 2 visitas, su propio conteo');
    assert(
      barB!.visitsTotal === 1,
      'Bar B: 1 visita, su propio conteo — no se mezclan',
    );

    const goalsInBarB = await prisma.customerRewardGoal.count({
      where: { businessId: businessBId },
    });
    const goalsInCafeA = await prisma.customerRewardGoal.count({
      where: { businessId: businessAId },
    });
    assert(
      goalsInBarB === 0,
      'Bar B no tiene ninguna meta — nunca vio la de Café A',
    );
    assert(
      goalsInCafeA === 1,
      'la única meta creada sigue perteneciendo a Café A',
    );

    console.log('\n=== ALL CHECKS PASSED ===');
  } finally {
    console.log('\n=== CLEANUP ===');
    if (businessAId || businessBId) {
      const ids = [businessAId, businessBId].filter(Boolean);
      await prisma.customerEvent.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.message.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.benefitParticipation.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.benefit.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.customerRewardGoal.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.retentionSettings.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.customerSession.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.visit.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.visitSource.deleteMany({
        where: { businessId: { in: ids } },
      });
      const customers = await prisma.customer.findMany({
        where: { businessId: { in: ids } },
        select: { id: true, flikkerAccountId: true },
      });
      await prisma.customer.deleteMany({ where: { businessId: { in: ids } } });
      const flikkerAccountIds = [
        ...new Set(
          customers
            .map((c) => c.flikkerAccountId)
            .filter((x): x is string => Boolean(x)),
        ),
      ];
      if (flikkerAccountIds.length) {
        await prisma.flikkerAccountSession.deleteMany({
          where: { flikkerAccountId: { in: flikkerAccountIds } },
        });
        await prisma.flikkerAccount.deleteMany({
          where: { id: { in: flikkerAccountIds } },
        });
      }
      await prisma.flikkerAccountVerification.deleteMany({
        where: { phoneE164: SHARED_PHONE_E164 },
      });
      await prisma.business.deleteMany({ where: { id: { in: ids } } });
      console.log('  removed every seeded row');
    }
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      `\nERROR: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });

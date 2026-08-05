/**
 * READ-ONLY audit of a business's dashboard metrics. Runs only SELECTs — it
 * never writes, updates or deletes anything.
 *
 * Explains where each number on the panel comes from and, when the contact
 * count looks inflated, prints exactly which rows are responsible (duplicate
 * phones, soft-deleted contacts, rows captured before Flikker started).
 *
 * Usage (from apps/api):
 *   DATABASE_URL="<url>" npx ts-node -r tsconfig-paths/register \
 *     scripts/audit-business-metrics.ts --business=<id|slug>
 *
 * Without --business it lists the businesses so you can pick one.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function fmt(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 16).replace('T', ' ') : '—';
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const key = argValue('business');
    if (!key) {
      const businesses = await prisma.business.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { customers: true, googleReviews: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      console.log('Negocios (usá --business=<id|slug>):');
      for (const b of businesses) {
        console.log(
          `  ${b.id}  ${b.slug.padEnd(28)} ${b.name}  ` +
            `(customers: ${b._count.customers}, reseñas: ${b._count.googleReviews})`,
        );
      }
      return;
    }

    const business = await prisma.business.findFirst({
      where: { OR: [{ id: key }, { slug: key }] },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    if (!business) throw new Error(`No existe el negocio "${key}"`);

    const firstPlan = await prisma.businessPlan.findFirst({
      where: { businessId: business.id },
      orderBy: { createdAt: 'asc' },
      select: {
        plan: true,
        trialStart: true,
        startDate: true,
        trialGoal: true,
      },
    });
    const planStart = firstPlan?.trialStart ?? firstPlan?.startDate;
    const flikkerStartAt =
      planStart && planStart > business.createdAt
        ? planStart
        : business.createdAt;

    console.log(`\n=== ${business.name} (${business.slug}) ===`);
    console.log(`business.createdAt : ${fmt(business.createdAt)}`);
    console.log(
      `primer plan        : ${firstPlan?.plan ?? '—'} | trialStart ${fmt(
        firstPlan?.trialStart,
      )} | startDate ${fmt(firstPlan?.startDate)} | meta ${firstPlan?.trialGoal ?? '—'}`,
    );
    console.log(`>> INICIO EN FLIKKER: ${fmt(flikkerStartAt)}`);

    // ── Contactos ────────────────────────────────────────────────────────────
    const allQr = await prisma.customer.findMany({
      where: { businessId: business.id, origin: 'qr' },
      select: {
        id: true,
        name: true,
        phoneE164: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const counted = allQr.filter(
      (c) => c.isActive && c.createdAt >= flikkerStartAt,
    );
    const uniquePhones = new Set(
      counted
        .map((c) => c.phoneE164?.trim().toLowerCase())
        .filter((p): p is string => !!p),
    );
    const noPhone = counted.filter((c) => !c.phoneE164?.trim()).length;

    console.log('\n--- CONTACTOS ---');
    console.log(`filas origin=qr (definición vieja)     : ${allQr.length}`);
    console.log(
      `  · descartadas por borradas (isActive): ${allQr.filter((c) => !c.isActive).length}`,
    );
    console.log(
      `  · descartadas por anteriores a Flikker: ${allQr.filter((c) => c.isActive && c.createdAt < flikkerStartAt).length}`,
    );
    console.log(`filas que cuentan                      : ${counted.length}`);
    console.log(
      `>> PERSONAS ÚNICAS (definición nueva)  : ${uniquePhones.size + noPhone}`,
    );

    const byPhone = new Map<string, typeof counted>();
    for (const c of counted) {
      const phone = c.phoneE164?.trim().toLowerCase();
      if (!phone) continue;
      byPhone.set(phone, [...(byPhone.get(phone) ?? []), c]);
    }
    const dupes = [...byPhone.entries()].filter(([, rows]) => rows.length > 1);
    if (dupes.length) {
      console.log('\n  TELÉFONOS DUPLICADOS (misma persona, varias filas):');
      for (const [phone, rows] of dupes) {
        console.log(`   ${phone}`);
        for (const r of rows) {
          console.log(`     - ${r.id} | ${r.name} | ${fmt(r.createdAt)}`);
        }
      }
    }
    const inactive = allQr.filter((c) => !c.isActive);
    if (inactive.length) {
      console.log(
        '\n  CONTACTOS BORRADOS que la métrica vieja seguía contando:',
      );
      for (const r of inactive) {
        console.log(
          `   - ${r.id} | ${r.name} | ${r.phoneE164} | ${fmt(r.createdAt)}`,
        );
      }
    }
    const preFlikker = allQr.filter(
      (c) => c.isActive && c.createdAt < flikkerStartAt,
    );
    if (preFlikker.length) {
      console.log('\n  CONTACTOS ANTERIORES AL INICIO DE FLIKKER:');
      for (const r of preFlikker) {
        console.log(
          `   - ${r.id} | ${r.name} | ${r.phoneE164} | ${fmt(r.createdAt)}`,
        );
      }
    }
    if (!dupes.length && !inactive.length && !preFlikker.length) {
      console.log(
        '\n  (sin duplicados, borrados ni previos: el número no baja)',
      );
    }

    // ── Reseñas ──────────────────────────────────────────────────────────────
    const totalReviews = await prisma.googleReview.count({
      where: { businessId: business.id },
    });
    const sinceFlikker = await prisma.googleReview.count({
      where: { businessId: business.id, postedAt: { gte: flikkerStartAt } },
    });
    const attributed = await prisma.googleReview.count({
      where: { businessId: business.id, attributedMessageId: { not: null } },
    });
    const sentMessages = await prisma.message.count({
      where: {
        businessId: business.id,
        status: { in: ['sent', 'delivered', 'read'] },
      },
    });
    const queuedOrFailed = await prisma.message.count({
      where: { businessId: business.id, status: { in: ['queued', 'failed'] } },
    });

    console.log('\n--- RESEÑAS ---');
    console.log(`reseñas de Google (todas)              : ${totalReviews}`);
    console.log(`>> RESEÑAS DESDE FLIKKER               : ${sinceFlikker}`);
    console.log(`atribuidas a un mensaje (columna vieja): ${attributed}`);
    console.log(`mensajes efectivamente enviados        : ${sentMessages}`);
    console.log(`mensajes encolados/fallidos            : ${queuedOrFailed}`);
    if (attributed === 0 && sentMessages === 0) {
      console.log(
        '  → la atribución por mensaje da 0 porque nunca se envió ningún WhatsApp',
      );
    }

    // ── Escaneos ─────────────────────────────────────────────────────────────
    const campaign = await prisma.campaign.findFirst({
      where: {
        businessId: business.id,
        status: 'ACTIVE',
        templateKind: 'qr_capture',
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const scansAll = campaign
      ? await prisma.scanEvent.count({
          where: { businessId: business.id, campaignId: campaign.id },
        })
      : 0;
    const scansSince = campaign
      ? await prisma.scanEvent.count({
          where: {
            businessId: business.id,
            campaignId: campaign.id,
            scannedAt: { gte: flikkerStartAt },
          },
        })
      : 0;

    console.log('\n--- ESCANEOS ---');
    console.log(`todos                                  : ${scansAll}`);
    console.log(`>> DESDE FLIKKER                       : ${scansSince}`);

    console.log('\n=== RESULTADO CON LAS DEFINICIONES NUEVAS ===');
    console.log(`Escaneos : ${scansSince}`);
    console.log(`Contactos: ${uniquePhones.size + noPhone}  (personas únicas)`);
    console.log(
      `Reseñas  : ${sinceFlikker}  (de Google, desde que usa Flikker)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    `\nERROR: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});

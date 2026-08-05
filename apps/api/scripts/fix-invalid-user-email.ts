/**
 * Repairs a user account whose email was stored malformed (e.g. a domain that
 * lost its `.com`), which makes logging in with the correct address impossible.
 *
 * Safe by design:
 *  - dry run unless `--apply` is passed;
 *  - refuses to write if another account already owns the target email;
 *  - only rewrites the email columns — every relation (memberships, business,
 *    customers, metrics, …) is keyed by user id and is left untouched;
 *  - idempotent: re-running after a successful fix reports nothing to do.
 *
 * Usage (from apps/api):
 *   npx ts-node -r tsconfig-paths/register scripts/fix-invalid-user-email.ts
 *   npx ts-node -r tsconfig-paths/register scripts/fix-invalid-user-email.ts \
 *     --from=usuario@gmail --to=usuario@gmail.com --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const apply = process.argv.includes('--apply');
  const from = argValue('from');
  const to = argValue('to');

  try {
    // 1. Report every malformed account so nothing is fixed blindly.
    const users = await prisma.user.findMany({
      select: { id: true, email: true, notificationEmail: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const malformed = users.filter((u) => !EMAIL_REGEX.test(normalize(u.email)));

    console.log(`Usuarios totales: ${users.length}`);
    if (malformed.length === 0) {
      console.log('No hay cuentas con email malformado.');
    } else {
      console.log(`Cuentas con email malformado: ${malformed.length}`);
      for (const u of malformed) {
        console.log(`  - ${u.email}  (id=${u.id}, activo=${u.isActive})`);
      }
    }

    if (!from || !to) {
      console.log(
        '\nPara corregir una cuenta:\n' +
          '  --from=<email actual> --to=<email correcto> [--apply]\n' +
          '(sin --apply solo simula, no escribe nada)',
      );
      return;
    }

    const fromEmail = normalize(from);
    const toEmail = normalize(to);

    if (!EMAIL_REGEX.test(toEmail)) {
      throw new Error(`El email destino no es válido: ${toEmail}`);
    }

    const source = await prisma.user.findUnique({
      where: { email: fromEmail },
      select: { id: true, email: true, notificationEmail: true },
    });
    if (!source) {
      console.log(`\nNo existe ninguna cuenta con el email ${fromEmail}.`);
      return;
    }

    // 2. Never create a duplicate: the target must be free (or already be us).
    const target = await prisma.user.findUnique({
      where: { email: toEmail },
      select: { id: true },
    });
    if (target && target.id !== source.id) {
      throw new Error(
        `Ya existe otra cuenta (id=${target.id}) con el email ${toEmail}. ` +
          'No se modifica nada para evitar duplicados — hay que fusionar manualmente.',
      );
    }
    if (target && target.id === source.id) {
      console.log(`\nLa cuenta ya tiene el email ${toEmail}. Nada que hacer.`);
      return;
    }

    // 3. Related email columns on the same account.
    const alsoFixNotification =
      source.notificationEmail != null &&
      normalize(source.notificationEmail) === fromEmail;

    console.log(`\nCuenta encontrada: id=${source.id}`);
    console.log(`  email:               ${source.email}  ->  ${toEmail}`);
    if (alsoFixNotification) {
      console.log(
        `  notificationEmail:   ${source.notificationEmail}  ->  ${toEmail}`,
      );
    }
    console.log(
      '  relaciones (memberships, negocio, clientes, métricas): sin cambios (se referencian por id)',
    );

    if (!apply) {
      console.log('\n[DRY RUN] No se escribió nada. Repetí con --apply.');
      return;
    }

    await prisma.user.update({
      where: { id: source.id },
      data: {
        email: toEmail,
        ...(alsoFixNotification ? { notificationEmail: toEmail } : {}),
      },
    });

    // Sessions issued before the fix stay valid (they are keyed by user id);
    // the login email is what changed.
    console.log('\n✓ Email corregido correctamente.');
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

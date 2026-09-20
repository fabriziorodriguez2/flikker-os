import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El seed no puede correr contra producción.
 *
 * Crea negocios de demo y usuarios con una contraseña conocida y escrita en
 * el propio archivo (`admin@flikker.dev` / `Flikker2026!`, con
 * `isPlatformAdmin: true`). Y como usa `upsert` en todo, es idempotente —
 * lo que significa que una corrida accidental contra la base productiva los
 * RECREA, incluso después de haberlos borrado.
 *
 * Eso ya pasó: los dos negocios de ejemplo estaban en producción, archivados,
 * y se borraron en la limpieza. Este guard es lo que evita que vuelvan.
 *
 * Se verifica leyendo la fuente y no ejecutando el seed a propósito:
 * importarlo dispara la conexión a la base y la corrida entera.
 */
describe('prisma/seed.ts — nunca corre en producción', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', '..', 'prisma', 'seed.ts'),
    'utf-8',
  );

  it('decide por NODE_ENV', () => {
    expect(source).toContain(
      "const IS_PRODUCTION = process.env.NODE_ENV === 'production'",
    );
  });

  it('en producción está bloqueado salvo un opt-in explícito', () => {
    expect(source).toContain(
      "!IS_PRODUCTION || process.env.SEED_ALLOW_DEMO === 'true'",
    );
  });

  /*
    Falla ruidosamente y con exit code distinto de cero. Un seed que se
    saltea en silencio en producción es peor que uno que no existe: quien
    lo corrió se queda pensando que funcionó.
  */
  it('sale con error visible, no en silencio', () => {
    const guard = source.slice(
      source.indexOf('if (!DEMO_SEED_ALLOWED)'),
      source.indexOf('🌱 Seeding'),
    );
    expect(guard).toContain('console.error');
    expect(guard).toContain('process.exitCode = 1');
    expect(guard).toContain('return;');
  });

  /*
    El guard tiene que ser lo PRIMERO de `main()`. Si quedara después de
    cualquier escritura, esa escritura ya habría ocurrido.
  */
  it('el guard va antes de cualquier escritura', () => {
    const mainStart = source.indexOf('async function main()');
    const guardAt = source.indexOf('if (!DEMO_SEED_ALLOWED)', mainStart);
    const firstWrite = Math.min(
      ...['upsert(', 'create(', 'createMany(', 'deleteMany(']
        .map((op) => source.indexOf(op, mainStart))
        .filter((i) => i > -1),
    );

    expect(guardAt).toBeGreaterThan(mainStart);
    expect(guardAt).toBeLessThan(firstWrite);
  });

  /*
    Los planes son la única cosa del seed que el runtime necesita de verdad,
    y no dependen de él: `PlansRepository` los crea con upsert cuando hacen
    falta. El mensaje lo dice, para que nadie crea que bloquear el seed deja
    una instalación productiva a medias.
  */
  it('el mensaje aclara que los planes no dependen del seed', () => {
    expect(source).toContain('ensureFreePlan()');
    expect(source).toContain('ensureProSelfServicePlan()');
  });

  it('sigue sembrando demo fuera de producción — dev y test no se rompen', () => {
    expect(source).toContain('clinica-dental-ejemplo');
    expect(source).toContain('centro-estetica-ejemplo');
  });
});

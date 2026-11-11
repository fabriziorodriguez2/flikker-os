import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  IntelligenceMessageRole,
  MembershipRole,
  MembershipStatus,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import {
  createTestBusiness,
  createTestMembership,
  createTestUser,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { AgentService } from './agent/agent.service';
import { DEFAULT_CONVERSATION_TITLE } from './message-content';

/** Solo reemplaza la verificación del JWT; TenantGuard y RolesGuard son los reales. */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-test-user-id'];
    if (!userId) return false;
    req.user = {
      id: userId,
      email: 'intelligence@test.local',
      firstName: 'Intel',
      lastName: 'Tester',
      isActive: true,
      isPlatformAdmin: false,
    };
    return true;
  }
}

describe('Intelligence conversations (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let service: ConversationsService;

  const userIds: string[] = [];
  const businessIds: string[] = [];

  let bizA: string;
  let bizB: string;
  let owner: string; // OWNER en A
  let operator: string; // OPERATOR en A
  let outsider: string; // OWNER en B, sin membresía en A
  let revoked: string; // membresía REVOKED en A

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      controllers: [ConversationsController],
      // El agente se prueba en `agent/agent.integration.spec.ts`; acá solo CRUD.
      providers: [
        ConversationsService,
        { provide: AgentService, useValue: {} },
      ],
    })
      .overrideGuard(JwtGuard)
      .useClass(FakeJwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    service = app.get(ConversationsService);

    const s = makeTestSuffix();
    bizA = (await createTestBusiness(prisma, `${s}-a`)).id;
    bizB = (await createTestBusiness(prisma, `${s}-b`)).id;
    businessIds.push(bizA, bizB);

    owner = (await createTestUser(prisma, `${s}-owner`)).id;
    operator = (await createTestUser(prisma, `${s}-op`)).id;
    outsider = (await createTestUser(prisma, `${s}-out`)).id;
    revoked = (await createTestUser(prisma, `${s}-rev`)).id;
    userIds.push(owner, operator, outsider, revoked);

    await createTestMembership(prisma, owner, bizA, MembershipRole.OWNER);
    await createTestMembership(prisma, operator, bizA, MembershipRole.OPERATOR);
    await createTestMembership(prisma, outsider, bizB, MembershipRole.OWNER);
    await createTestMembership(
      prisma,
      revoked,
      bizA,
      MembershipRole.ADMIN,
      MembershipStatus.REVOKED,
    );
  });

  afterAll(async () => {
    await prisma.intelligenceConversation.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.membership.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const as = (userId: string, businessId: string) => ({
    'x-test-user-id': userId,
    'x-business-id': businessId,
  });

  async function createConversation(
    userId: string,
    businessId: string,
    body: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/intelligence/conversations')
      .set(as(userId, businessId))
      .send(body)
      .expect(201);
    return (res.body as { id: string }).id;
  }

  type Page<T> = { items: T[]; nextCursor: string | null };

  describe('creación', () => {
    it('crea con título automático por defecto, sin exponer ids internos', async () => {
      const res = await request(app.getHttpServer())
        .post('/intelligence/conversations')
        .set(as(owner, bizA))
        .send({})
        .expect(201);

      expect(res.body).toMatchObject({
        title: DEFAULT_CONVERSATION_TITLE,
        titleSource: 'AUTO',
        status: 'ACTIVE',
      });
      expect(res.body.businessId).toBeUndefined();
      expect(res.body.createdByUserId).toBeUndefined();

      const row = await prisma.intelligenceConversation.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.businessId).toBe(bizA);
      expect(row.createdByUserId).toBe(owner);
    });

    it('un título enviado queda como MANUAL y se trimea', async () => {
      const res = await request(app.getHttpServer())
        .post('/intelligence/conversations')
        .set(as(owner, bizA))
        .send({ title: '  Ventas de octubre  ' })
        .expect(201);
      expect(res.body).toMatchObject({
        title: 'Ventas de octubre',
        titleSource: 'MANUAL',
      });
    });

    it('ignora cualquier intento de fijar businessId/owner desde el body', async () => {
      await request(app.getHttpServer())
        .post('/intelligence/conversations')
        .set(as(owner, bizA))
        .send({ businessId: bizB, createdByUserId: outsider })
        .expect(400);
    });

    it.each([
      ['vacío', { title: '   ' }],
      ['demasiado largo', { title: 'x'.repeat(121) }],
      ['no string', { title: 42 }],
    ])('rechaza un título %s', async (_label, body) => {
      await request(app.getHttpServer())
        .post('/intelligence/conversations')
        .set(as(owner, bizA))
        .send(body)
        .expect(400);
    });
  });

  describe('autenticación y tenancy', () => {
    it('sin header x-business-id → 403', async () => {
      await request(app.getHttpServer())
        .get('/intelligence/conversations')
        .set({ 'x-test-user-id': owner })
        .expect(403);
    });

    it('header de un negocio donde no es miembro → 403', async () => {
      await request(app.getHttpServer())
        .get('/intelligence/conversations')
        .set(as(owner, bizB))
        .expect(403);
    });

    it('membresía REVOKED → 403', async () => {
      await request(app.getHttpServer())
        .get('/intelligence/conversations')
        .set(as(revoked, bizA))
        .expect(403);
    });

    it('sin usuario autenticado → 403', async () => {
      await request(app.getHttpServer())
        .get('/intelligence/conversations')
        .set({ 'x-business-id': bizA })
        .expect(403);
    });

    it('otro miembro del MISMO negocio no ve ni toca conversaciones ajenas', async () => {
      const id = await createConversation(owner, bizA, { title: 'Privada' });
      const server = app.getHttpServer();

      const list = await request(server)
        .get('/intelligence/conversations')
        .set(as(operator, bizA))
        .expect(200);
      expect(list.body.items.map((c: { id: string }) => c.id)).not.toContain(
        id,
      );

      await request(server)
        .get(`/intelligence/conversations/${id}`)
        .set(as(operator, bizA))
        .expect(404);
      await request(server)
        .get(`/intelligence/conversations/${id}/messages`)
        .set(as(operator, bizA))
        .expect(404);
      await request(server)
        .patch(`/intelligence/conversations/${id}`)
        .set(as(operator, bizA))
        .send({ title: 'Robada' })
        .expect(404);
      await request(server)
        .delete(`/intelligence/conversations/${id}`)
        .set(as(operator, bizA))
        .expect(404);

      const row = await prisma.intelligenceConversation.findUniqueOrThrow({
        where: { id },
      });
      expect(row.title).toBe('Privada');
      expect(row.deletedAt).toBeNull();
    });

    it('conocer el id de una conversación de otro negocio no da acceso', async () => {
      const id = await createConversation(owner, bizA);
      await request(app.getHttpServer())
        .get(`/intelligence/conversations/${id}`)
        .set(as(outsider, bizB))
        .expect(404);
    });

    it('el mismo usuario en otro negocio no arrastra sus conversaciones', async () => {
      await createTestMembership(prisma, owner, bizB, MembershipRole.VIEWER);
      const idA = await createConversation(owner, bizA, { title: 'Solo en A' });

      const listB = await request(app.getHttpServer())
        .get('/intelligence/conversations')
        .set(as(owner, bizB))
        .expect(200);
      expect(listB.body.items.map((c: { id: string }) => c.id)).not.toContain(
        idA,
      );

      await request(app.getHttpServer())
        .get(`/intelligence/conversations/${idA}`)
        .set(as(owner, bizB))
        .expect(404);

      await prisma.membership.deleteMany({
        where: { userId: owner, businessId: bizB },
      });
    });

    it('un VIEWER también puede tener sus propias conversaciones (política explícita)', async () => {
      const s = makeTestSuffix();
      const viewer = (await createTestUser(prisma, `${s}-viewer`)).id;
      userIds.push(viewer);
      await createTestMembership(prisma, viewer, bizA, MembershipRole.VIEWER);
      await createConversation(viewer, bizA);
    });

    it('rechaza ids que no son UUID', async () => {
      await request(app.getHttpServer())
        .get('/intelligence/conversations/not-a-uuid')
        .set(as(owner, bizA))
        .expect(400);
    });
  });

  describe('listado, búsqueda y paginación', () => {
    let pager: string;
    const ids: string[] = [];

    beforeAll(async () => {
      const s = makeTestSuffix();
      pager = (await createTestUser(prisma, `${s}-pager`)).id;
      userIds.push(pager);
      await createTestMembership(prisma, pager, bizA, MembershipRole.ADMIN);

      // 5 conversaciones con actividad distinta, más 2 con el MISMO instante
      // para ejercitar el desempate por id del cursor.
      const base = new Date('2026-11-01T10:00:00.000Z').getTime();
      const instants = [0, 1, 2, 3, 4, 5, 5].map(
        (i) => new Date(base + i * 60_000),
      );
      for (const [i, at] of instants.entries()) {
        const id = await createConversation(pager, bizA, {
          title: `Tema ${i} ${i % 2 ? 'ventas' : 'reseñas'}`,
        });
        await prisma.intelligenceConversation.update({
          where: { id },
          data: { lastActivityAt: at },
        });
        ids.push(id);
      }
    });

    it('recorre todas las páginas sin repetir ni saltear, de más reciente a más vieja', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res = await request(app.getHttpServer())
          .get('/intelligence/conversations')
          .query({ limit: 2, ...(cursor ? { cursor } : {}) })
          .set(as(pager, bizA))
          .expect(200);
        const body = res.body as Page<{ id: string }>;
        expect(body.items.length).toBeLessThanOrEqual(2);
        seen.push(...body.items.map((c) => c.id));
        cursor = body.nextCursor;
      } while (cursor);

      expect(seen).toHaveLength(ids.length);
      expect(new Set(seen).size).toBe(ids.length);

      const rows = await prisma.intelligenceConversation.findMany({
        where: { id: { in: seen } },
        select: { id: true, lastActivityAt: true },
      });
      const at = new Map(rows.map((r) => [r.id, r.lastActivityAt.getTime()]));
      for (let i = 1; i < seen.length; i++) {
        expect(at.get(seen[i - 1])!).toBeGreaterThanOrEqual(at.get(seen[i])!);
      }
    });

    it('busca por título sin distinguir mayúsculas', async () => {
      const res = await request(app.getHttpServer())
        .get('/intelligence/conversations')
        .query({ q: 'VENTAS' })
        .set(as(pager, bizA))
        .expect(200);
      expect(res.body.items).toHaveLength(3);
      expect(
        res.body.items.every((c: { title: string }) =>
          c.title.includes('ventas'),
        ),
      ).toBe(true);
    });

    it.each([
      [{ limit: 0 }],
      [{ limit: 51 }],
      [{ limit: 'abc' }],
      [{ cursor: 'basura' }],
      [{ q: 'x'.repeat(101) }],
      [{ status: 'DELETED' }],
    ])('rechaza parámetros inválidos %j', async (query) => {
      await request(app.getHttpServer())
        .get('/intelligence/conversations')
        .query(query)
        .set(as(pager, bizA))
        .expect(400);
    });
  });

  describe('renombrar, archivar y eliminar', () => {
    it('renombrar pasa el título a MANUAL', async () => {
      const id = await createConversation(owner, bizA);
      const res = await request(app.getHttpServer())
        .patch(`/intelligence/conversations/${id}`)
        .set(as(owner, bizA))
        .send({ title: 'Mi análisis' })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'Mi análisis',
        titleSource: 'MANUAL',
      });
    });

    it('PATCH vacío → 400', async () => {
      const id = await createConversation(owner, bizA);
      await request(app.getHttpServer())
        .patch(`/intelligence/conversations/${id}`)
        .set(as(owner, bizA))
        .send({})
        .expect(400);
    });

    it('archivar la saca del listado activo y la deja en el de archivadas; se puede reactivar', async () => {
      const id = await createConversation(owner, bizA, {
        title: 'Para archivar',
      });
      const server = app.getHttpServer();

      const archived = await request(server)
        .patch(`/intelligence/conversations/${id}`)
        .set(as(owner, bizA))
        .send({ status: 'ARCHIVED' })
        .expect(200);
      expect(archived.body.status).toBe('ARCHIVED');
      expect(archived.body.archivedAt).not.toBeNull();

      const active = await request(server)
        .get('/intelligence/conversations')
        .set(as(owner, bizA))
        .expect(200);
      expect(active.body.items.map((c: { id: string }) => c.id)).not.toContain(
        id,
      );

      const archivedList = await request(server)
        .get('/intelligence/conversations')
        .query({ status: 'ARCHIVED' })
        .set(as(owner, bizA))
        .expect(200);
      expect(
        archivedList.body.items.map((c: { id: string }) => c.id),
      ).toContain(id);

      const restored = await request(server)
        .patch(`/intelligence/conversations/${id}`)
        .set(as(owner, bizA))
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(restored.body.archivedAt).toBeNull();
    });

    it('eliminar es lógico: desaparece de toda la API pero la fila queda marcada', async () => {
      const id = await createConversation(owner, bizA);
      const server = app.getHttpServer();

      await request(server)
        .delete(`/intelligence/conversations/${id}`)
        .set(as(owner, bizA))
        .expect(204);
      await request(server)
        .get(`/intelligence/conversations/${id}`)
        .set(as(owner, bizA))
        .expect(404);
      await request(server)
        .delete(`/intelligence/conversations/${id}`)
        .set(as(owner, bizA))
        .expect(404);
      await request(server)
        .patch(`/intelligence/conversations/${id}`)
        .set(as(owner, bizA))
        .send({ title: 'x' })
        .expect(404);

      for (const status of ['ACTIVE', 'ARCHIVED']) {
        const list = await request(server)
          .get('/intelligence/conversations')
          .query({ status })
          .set(as(owner, bizA))
          .expect(200);
        expect(list.body.items.map((c: { id: string }) => c.id)).not.toContain(
          id,
        );
      }

      const row = await prisma.intelligenceConversation.findUniqueOrThrow({
        where: { id },
      });
      expect(row.deletedAt).not.toBeNull();
    });
  });

  describe('mensajes', () => {
    it('el primer mensaje del usuario titula una conversación AUTO; los siguientes no', async () => {
      const id = await createConversation(owner, bizA);
      const scope = { businessId: bizA, userId: owner };

      await service.appendMessage(scope, id, {
        role: IntelligenceMessageRole.USER,
        content: '¿Cuántos clientes volvieron este mes?',
      });
      await service.appendMessage(scope, id, {
        role: IntelligenceMessageRole.USER,
        content: 'Otra pregunta',
      });

      const conv = await service.get(scope, id);
      expect(conv.title).toBe('¿Cuántos clientes volvieron este mes?');
      expect(conv.titleSource).toBe('AUTO');
    });

    it('nunca pisa un título MANUAL', async () => {
      const id = await createConversation(owner, bizA, {
        title: 'Elegido a mano',
      });
      await service.appendMessage({ businessId: bizA, userId: owner }, id, {
        role: IntelligenceMessageRole.USER,
        content: 'Hola',
      });
      expect(
        (await service.get({ businessId: bizA, userId: owner }, id)).title,
      ).toBe('Elegido a mano');
    });

    it('pagina en orden cronológico, de los más recientes hacia atrás, aun dentro del mismo ms', async () => {
      const id = await createConversation(owner, bizA);
      const scope = { businessId: bizA, userId: owner };
      const contents = Array.from({ length: 7 }, (_, i) => `mensaje ${i}`);
      for (const [i, content] of contents.entries()) {
        await service.appendMessage(scope, id, {
          role:
            i % 2
              ? IntelligenceMessageRole.ASSISTANT
              : IntelligenceMessageRole.USER,
          content,
        });
      }

      const pages: string[][] = [];
      let cursor: string | null = null;
      do {
        const res = await request(app.getHttpServer())
          .get(`/intelligence/conversations/${id}/messages`)
          .query({ limit: 3, ...(cursor ? { cursor } : {}) })
          .set(as(owner, bizA))
          .expect(200);
        const body = res.body as Page<{ content: string }>;
        pages.push(body.items.map((m) => m.content));
        cursor = body.nextCursor;
      } while (cursor);

      expect(pages).toEqual([
        ['mensaje 4', 'mensaje 5', 'mensaje 6'],
        ['mensaje 1', 'mensaje 2', 'mensaje 3'],
        ['mensaje 0'],
      ]);
    });

    it('agregar un mensaje mueve la conversación al tope del listado', async () => {
      const older = await createConversation(owner, bizA, { title: 'Vieja' });
      await createConversation(owner, bizA, { title: 'Nueva' });
      await service.appendMessage({ businessId: bizA, userId: owner }, older, {
        role: IntelligenceMessageRole.USER,
        content: 'Reviviendo',
      });
      const list = await request(app.getHttpServer())
        .get('/intelligence/conversations')
        .set(as(owner, bizA))
        .expect(200);
      expect(list.body.items[0].id).toBe(older);
    });

    it('no se puede escribir en una conversación ajena ni eliminada', async () => {
      const id = await createConversation(owner, bizA);
      await expect(
        service.appendMessage({ businessId: bizA, userId: operator }, id, {
          role: IntelligenceMessageRole.USER,
          content: 'x',
        }),
      ).rejects.toThrow('Conversation not found');
      await expect(
        service.appendMessage({ businessId: bizB, userId: owner }, id, {
          role: IntelligenceMessageRole.USER,
          content: 'x',
        }),
      ).rejects.toThrow('Conversation not found');

      await service.softDelete({ businessId: bizA, userId: owner }, id);
      await expect(
        service.appendMessage({ businessId: bizA, userId: owner }, id, {
          role: IntelligenceMessageRole.USER,
          content: 'x',
        }),
      ).rejects.toThrow('Conversation not found');
    });

    it('rechaza metadata con datos de contacto sin escribir nada', async () => {
      const id = await createConversation(owner, bizA);
      await expect(
        service.appendMessage({ businessId: bizA, userId: owner }, id, {
          role: IntelligenceMessageRole.TOOL,
          content: 'resultado',
          metadata: { phone: '+598 99 123 456' },
        }),
      ).rejects.toThrow('contact data');
      expect(
        await prisma.intelligenceMessage.count({
          where: { conversationId: id },
        }),
      ).toBe(0);
    });

    it('la base impide un mensaje con businessId distinto al de su conversación', async () => {
      const id = await createConversation(owner, bizA);
      await expect(
        prisma.intelligenceMessage.create({
          data: {
            conversationId: id,
            businessId: bizB,
            role: IntelligenceMessageRole.USER,
            content: 'cruzado',
          },
        }),
      ).rejects.toThrow();
    });
  });
});

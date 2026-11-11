import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntelligenceConversationStatus,
  IntelligenceMessageKind,
  IntelligenceMessageRole,
  IntelligenceTitleSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeCursor, encodeCursor } from './conversation-cursor';
import {
  CreateConversationDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  UpdateConversationDto,
} from './dto/conversation.dto';
import {
  DEFAULT_CONVERSATION_TITLE,
  deriveAutoTitle,
  validateMessageContent,
  validateMessageMetadata,
} from './message-content';

/** Siempre resuelto por los guards (JWT + TenantGuard), nunca por el body. */
export interface ConversationScope {
  businessId: string;
  userId: string;
}

export interface AppendMessageInput {
  role: IntelligenceMessageRole;
  kind?: IntelligenceMessageKind;
  content: string;
  metadata?: unknown;
}

const DEFAULT_CONVERSATION_PAGE = 20;
const DEFAULT_MESSAGE_PAGE = 50;

const CONVERSATION_SELECT = {
  id: true,
  title: true,
  titleSource: true,
  status: true,
  lastActivityAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IntelligenceConversationSelect;

const MESSAGE_SELECT = {
  id: true,
  role: true,
  kind: true,
  content: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.IntelligenceMessageSelect;

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(scope: ConversationScope, dto: CreateConversationDto) {
    return this.prisma.intelligenceConversation.create({
      data: {
        businessId: scope.businessId,
        createdByUserId: scope.userId,
        title: dto.title ?? DEFAULT_CONVERSATION_TITLE,
        titleSource: dto.title
          ? IntelligenceTitleSource.MANUAL
          : IntelligenceTitleSource.AUTO,
      },
      select: CONVERSATION_SELECT,
    });
  }

  async list(scope: ConversationScope, query: ListConversationsQueryDto) {
    const limit = query.limit ?? DEFAULT_CONVERSATION_PAGE;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.prisma.intelligenceConversation.findMany({
      where: {
        ...this.ownedWhere(scope),
        status: query.status ?? IntelligenceConversationStatus.ACTIVE,
        ...(query.q
          ? { title: { contains: query.q, mode: 'insensitive' as const } }
          : {}),
        ...(cursor
          ? {
              OR: [
                { lastActivityAt: { lt: cursor.at } },
                { lastActivityAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: CONVERSATION_SELECT,
    });

    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ at: last.lastActivityAt, id: last.id })
          : null,
    };
  }

  async get(scope: ConversationScope, id: string) {
    return this.findOwned(scope, id);
  }

  /**
   * Página de mensajes en orden cronológico. Sin cursor trae los más
   * recientes; `nextCursor` apunta a los anteriores (scroll hacia arriba).
   */
  async listMessages(
    scope: ConversationScope,
    id: string,
    query: ListMessagesQueryDto,
  ) {
    await this.findOwned(scope, id);
    const limit = query.limit ?? DEFAULT_MESSAGE_PAGE;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.prisma.intelligenceMessage.findMany({
      where: {
        conversationId: id,
        businessId: scope.businessId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.at } },
                { createdAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: MESSAGE_SELECT,
    });

    const page = rows.slice(0, limit);
    const oldest = page[page.length - 1];
    return {
      items: page.reverse(),
      nextCursor:
        rows.length > limit && oldest
          ? encodeCursor({ at: oldest.createdAt, id: oldest.id })
          : null,
    };
  }

  async update(
    scope: ConversationScope,
    id: string,
    dto: UpdateConversationDto,
  ) {
    if (dto.title === undefined && dto.status === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    const data: Prisma.IntelligenceConversationUpdateManyMutationInput = {};
    if (dto.title !== undefined) {
      data.title = dto.title;
      data.titleSource = IntelligenceTitleSource.MANUAL;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.archivedAt =
        dto.status === IntelligenceConversationStatus.ARCHIVED
          ? new Date()
          : null;
    }

    // `updateMany` con el where de ownership completo: el chequeo y la
    // escritura son la misma sentencia, no hay ventana entre "es tuya" y
    // "la modifico".
    const { count } = await this.prisma.intelligenceConversation.updateMany({
      where: { id, ...this.ownedWhere(scope) },
      data,
    });
    if (count === 0) throw new NotFoundException('Conversation not found');

    return this.findOwned(scope, id);
  }

  async softDelete(scope: ConversationScope, id: string): Promise<void> {
    const { count } = await this.prisma.intelligenceConversation.updateMany({
      where: { id, ...this.ownedWhere(scope) },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Conversation not found');
  }

  /**
   * Única puerta de escritura de mensajes. No tiene endpoint propio todavía:
   * la usan los flujos de Intelligence que generan mensajes (usuario,
   * asistente, tools), siempre con el scope ya resuelto por los guards.
   */
  async appendMessage(
    scope: ConversationScope,
    conversationId: string,
    input: AppendMessageInput,
  ) {
    const content = validateMessageContent(input.content);
    const metadata = validateMessageMetadata(input.metadata);

    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE serializa los appends de una misma conversación: el orden
      // del chat sale de `createdAt`, así que cada mensaje nuevo tiene que
      // ser estrictamente posterior al anterior aunque caigan en el mismo ms.
      const [conversation] = await tx.$queryRaw<
        { title_source: IntelligenceTitleSource; last_activity_at: Date }[]
      >`
        SELECT title_source, last_activity_at
        FROM intelligence_conversations
        WHERE id = ${conversationId}
          AND business_id = ${scope.businessId}
          AND created_by_user_id = ${scope.userId}
          AND deleted_at IS NULL
        FOR UPDATE`;
      if (!conversation) throw new NotFoundException('Conversation not found');

      const createdAt = new Date(
        Math.max(Date.now(), conversation.last_activity_at.getTime() + 1),
      );

      const isFirstUserMessage =
        input.role === IntelligenceMessageRole.USER &&
        conversation.title_source === IntelligenceTitleSource.AUTO &&
        (await tx.intelligenceMessage.count({
          where: {
            conversationId,
            businessId: scope.businessId,
            role: IntelligenceMessageRole.USER,
          },
        })) === 0;

      const message = await tx.intelligenceMessage.create({
        data: {
          conversationId,
          businessId: scope.businessId,
          role: input.role,
          kind: input.kind ?? IntelligenceMessageKind.TEXT,
          content,
          createdAt,
          ...(metadata ? { metadata } : {}),
        },
        select: MESSAGE_SELECT,
      });

      await tx.intelligenceConversation.update({
        where: { id: conversationId },
        data: {
          lastActivityAt: message.createdAt,
          ...(isFirstUserMessage ? { title: deriveAutoTitle(content) } : {}),
        },
      });

      return message;
    });
  }

  /**
   * Los últimos mensajes en orden cronológico, con todo lo que el agente
   * necesita para su memoria y su grounding. Ownership verificado primero.
   */
  async recentForAgent(
    scope: ConversationScope,
    id: string,
    take = 200,
  ): Promise<
    {
      id: string;
      role: IntelligenceMessageRole;
      kind: IntelligenceMessageKind;
      content: string;
    }[]
  > {
    await this.findOwned(scope, id);
    const rows = await this.prisma.intelligenceMessage.findMany({
      where: { conversationId: id, businessId: scope.businessId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, role: true, kind: true, content: true },
    });
    return rows.reverse();
  }

  private ownedWhere(scope: ConversationScope) {
    return {
      businessId: scope.businessId,
      createdByUserId: scope.userId,
      deletedAt: null,
    };
  }

  private async findOwned(scope: ConversationScope, id: string) {
    const conversation = await this.prisma.intelligenceConversation.findFirst({
      where: { id, ...this.ownedWhere(scope) },
      select: CONVERSATION_SELECT,
    });
    // 404 tanto si no existe como si es de otro: no se filtra existencia.
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}

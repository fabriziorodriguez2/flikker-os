import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IntelligenceActionKind,
  IntelligenceActionMode,
  IntelligenceActionStatus,
  MembershipRole,
  Prisma,
  type IntelligenceAction,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import type { ConversationScope } from '../conversations.service';
import {
  ACTION_MODE,
  PROPOSAL_TTL_MS,
  computeIdempotencyKey,
  computePlanHash,
  type ActionParams,
} from './action-plan';
import {
  ActionHandlersService,
  ActionRejectedError,
  type ActionImpact,
  type PreparedAction,
  type ActionContext,
} from './action-handlers.service';

/** Quiénes pueden preparar y confirmar cambios: los mismos que en las pantallas. */
export const ACTION_ROLES: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
];

export interface ActionRequestContext {
  businessId: string;
  userId: string;
  role: MembershipRole;
  conversationId: string | null;
  /** El mensaje del dueño que originó el pedido: base de la idempotencia. */
  sourceMessageId: string;
  now: Date;
}

export interface ActionView {
  id: string;
  kind: IntelligenceActionKind;
  mode: IntelligenceActionMode;
  status: IntelligenceActionStatus;
  title: string;
  impact: ActionImpact;
  planHash: string;
  expiresAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  canConfirm: boolean;
  canCancel: boolean;
}

/** Lo que el agente recibe: el resultado del borrador o la propuesta pendiente. */
export type ActionRequestOutcome =
  | { ok: true; action: ActionView }
  | { ok: false; code: string; message: string };

interface StoredImpact extends ActionImpact {
  title: string;
  target: string;
}

/**
 * Las acciones del agente. Tres caminos, según el modo de la operación:
 *
 * - DRAFT: se ejecuta al pedirla (borradores sin efecto para clientes).
 * - CONFIRM: queda PROPOSED. Solo la ejecuta `confirm()`, un endpoint
 *   autenticado que recibe el `planHash` exacto que vio el dueño, revalida
 *   todo con los datos de ese momento y pasa PROPOSED → EXECUTING de forma
 *   atómica: un doble click o un reintento nunca ejecuta dos veces.
 * - DRY_RUN: solo calcula el impacto. No hay forma de ejecutarla.
 */
@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly handlers: ActionHandlersService,
    private readonly audit: AuditService,
  ) {}

  /** Pedido del agente. Nunca tira: un rechazo vuelve como resultado explicable. */
  async request(
    ctx: ActionRequestContext,
    kind: IntelligenceActionKind,
    params: ActionParams,
  ): Promise<ActionRequestOutcome> {
    if (!ACTION_ROLES.includes(ctx.role)) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        message:
          'Solo un dueño o administrador puede preparar cambios en el negocio.',
      };
    }

    const idempotencyKey = computeIdempotencyKey(
      ctx.sourceMessageId,
      kind,
      params,
    );
    const existing = await this.prisma.intelligenceAction.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: ctx.businessId,
          idempotencyKey,
        },
      },
    });
    if (existing) return { ok: true, action: this.view(existing, ctx.role) };

    const handlerCtx = {
      businessId: ctx.businessId,
      userId: ctx.userId,
      role: ctx.role,
      now: ctx.now,
    };
    let prepared: PreparedAction;
    try {
      prepared = await this.handlers.prepare(kind, handlerCtx, params);
    } catch (error) {
      return rejection(error);
    }

    const mode = ACTION_MODE[kind];
    const planHash = computePlanHash(kind, params, prepared.dataVersion);
    const impact: StoredImpact = {
      ...prepared.impact,
      title: prepared.title,
      target: prepared.target,
    };

    let action: IntelligenceAction;
    try {
      action = await this.prisma.$transaction(async (tx) => {
        if (mode === IntelligenceActionMode.CONFIRM) {
          // Un plan nuevo sobre lo mismo reemplaza al anterior: la
          // aprobación pendiente del plan viejo deja de servir.
          await tx.intelligenceAction.updateMany({
            where: {
              businessId: ctx.businessId,
              createdByUserId: ctx.userId,
              status: IntelligenceActionStatus.PROPOSED,
              impact: { path: ['target'], equals: prepared.target },
            },
            data: {
              status: IntelligenceActionStatus.EXPIRED,
              errorCode: 'SUPERSEDED',
              errorMessage: 'Hay una propuesta más nueva sobre lo mismo.',
            },
          });
        }
        return tx.intelligenceAction.create({
          data: {
            businessId: ctx.businessId,
            createdByUserId: ctx.userId,
            conversationId: ctx.conversationId,
            kind,
            mode,
            status:
              mode === IntelligenceActionMode.CONFIRM
                ? IntelligenceActionStatus.PROPOSED
                : mode === IntelligenceActionMode.DRY_RUN
                  ? IntelligenceActionStatus.DRY_RUN
                  : IntelligenceActionStatus.EXECUTING,
            params,
            impact: impact as unknown as Prisma.InputJsonValue,
            dataVersion: prepared.dataVersion,
            planHash,
            idempotencyKey,
            expiresAt:
              mode === IntelligenceActionMode.CONFIRM
                ? new Date(ctx.now.getTime() + PROPOSAL_TTL_MS)
                : null,
          },
        });
      });
    } catch (error) {
      // Dos pedidos idénticos a la vez: el segundo ve la fila del primero.
      if (isUniqueViolation(error)) {
        const winner = await this.prisma.intelligenceAction.findUnique({
          where: {
            businessId_idempotencyKey: {
              businessId: ctx.businessId,
              idempotencyKey,
            },
          },
        });
        if (winner) return { ok: true, action: this.view(winner, ctx.role) };
      }
      throw error;
    }

    await this.record(action, ctx.userId, auditVerb(mode));

    if (mode !== IntelligenceActionMode.DRAFT) {
      return { ok: true, action: this.view(action, ctx.role) };
    }
    const done = await this.run(action, handlerCtx);
    return done.status === IntelligenceActionStatus.EXECUTED
      ? { ok: true, action: this.view(done, ctx.role) }
      : {
          ok: false,
          code: done.errorCode ?? 'FAILED',
          message: done.errorMessage ?? 'No se pudo preparar el borrador.',
        };
  }

  async get(
    scope: ConversationScope,
    role: MembershipRole,
    id: string,
  ): Promise<ActionView> {
    return this.view(await this.find(scope, id), role);
  }

  /**
   * La confirmación del dueño. Idempotente: si la acción ya se ejecutó con
   * este mismo plan, devuelve el resultado sin volver a ejecutar.
   */
  async confirm(
    scope: ConversationScope,
    role: MembershipRole,
    id: string,
    planHash: string,
    now = new Date(),
  ): Promise<ActionView> {
    const action = await this.find(scope, id);
    if (action.mode !== IntelligenceActionMode.CONFIRM) {
      throw conflict(
        'NOT_CONFIRMABLE',
        action.mode === IntelligenceActionMode.DRY_RUN
          ? 'Esto es una simulación: no se puede ejecutar desde Intelligence.'
          : 'Este borrador no necesita confirmación.',
      );
    }
    if (action.planHash !== planHash) {
      throw conflict(
        'PLAN_MISMATCH',
        'Lo que confirmaste no coincide con esta propuesta. Volvé a abrirla.',
      );
    }
    if (action.status === IntelligenceActionStatus.EXECUTED) {
      return this.view(action, role);
    }
    if (action.status !== IntelligenceActionStatus.PROPOSED) {
      throw stateConflict(action);
    }
    if (action.expiresAt && action.expiresAt <= now) {
      await this.expire(
        action,
        'EXPIRED',
        'La propuesta venció sin confirmarse.',
      );
      throw conflict(
        'EXPIRED',
        'La propuesta venció. Pedile a Intelligence que la vuelva a armar.',
      );
    }

    // El único paso que importa para la concurrencia: de dos confirmaciones
    // simultáneas, una sola pasa de PROPOSED a EXECUTING.
    const claimed = await this.prisma.intelligenceAction.updateMany({
      where: {
        id: action.id,
        businessId: scope.businessId,
        status: IntelligenceActionStatus.PROPOSED,
        planHash,
      },
      data: { status: IntelligenceActionStatus.EXECUTING, decidedAt: now },
    });
    if (claimed.count === 0) {
      const current = await this.find(scope, id);
      if (current.status === IntelligenceActionStatus.EXECUTED) {
        return this.view(current, role);
      }
      throw stateConflict(current);
    }

    const handlerCtx = {
      businessId: scope.businessId,
      userId: scope.userId,
      role,
      now,
    };
    // La aprobación es sobre el plan Y los datos de ese momento: si algo
    // cambió desde la propuesta (otra persona pausó la campaña, se editó la
    // tarjeta), la aprobación caduca y no se ejecuta nada.
    try {
      const fresh = await this.handlers.prepare(
        action.kind,
        handlerCtx,
        action.params as ActionParams,
      );
      if (fresh.dataVersion !== action.dataVersion) {
        await this.expire(
          action,
          'DATA_CHANGED',
          'Los datos cambiaron desde la propuesta.',
        );
        throw conflict(
          'DATA_CHANGED',
          'Algo cambió desde que se armó la propuesta. Pedile a Intelligence que la vuelva a armar con los datos de ahora.',
        );
      }
    } catch (error) {
      if (error instanceof ActionRejectedError) {
        await this.expire(action, error.code, error.message);
        throw conflict(error.code, error.message);
      }
      if (!(error instanceof ConflictException)) {
        // Nunca queda trabada en EXECUTING: no se ejecutó nada.
        await this.prisma.intelligenceAction.update({
          where: { id: action.id },
          data: {
            status: IntelligenceActionStatus.FAILED,
            errorCode: 'VALIDATION_FAILED',
            errorMessage: 'No se pudo validar el cambio. No se modificó nada.',
          },
        });
      }
      throw error;
    }

    const done = await this.run(
      { ...action, status: IntelligenceActionStatus.EXECUTING },
      handlerCtx,
    );
    if (done.status !== IntelligenceActionStatus.EXECUTED) {
      throw conflict(
        done.errorCode ?? 'FAILED',
        done.errorMessage ?? 'No se pudo aplicar el cambio.',
      );
    }
    return this.view(done, role);
  }

  async cancel(
    scope: ConversationScope,
    role: MembershipRole,
    id: string,
    now = new Date(),
  ): Promise<ActionView> {
    const action = await this.find(scope, id);
    const cancelled = await this.prisma.intelligenceAction.updateMany({
      where: {
        id: action.id,
        businessId: scope.businessId,
        status: IntelligenceActionStatus.PROPOSED,
      },
      data: { status: IntelligenceActionStatus.CANCELLED, decidedAt: now },
    });
    const current = await this.find(scope, id);
    if (cancelled.count === 0) {
      if (current.status === IntelligenceActionStatus.CANCELLED) {
        return this.view(current, role);
      }
      throw stateConflict(current);
    }
    await this.record(current, scope.userId, 'CANCELLED');
    return this.view(current, role);
  }

  // -------------------------------------------------------------------------

  /** Ejecuta una acción ya reclamada (EXECUTING) y deja el resultado guardado. */
  private async run(
    action: IntelligenceAction,
    ctx: ActionContext,
  ): Promise<IntelligenceAction> {
    try {
      const result = await this.handlers.execute(
        action.kind,
        ctx,
        action.params as ActionParams,
      );
      const done = await this.prisma.intelligenceAction.update({
        where: { id: action.id },
        data: {
          status: IntelligenceActionStatus.EXECUTED,
          executedAt: new Date(),
          result: result as Prisma.InputJsonValue,
        },
      });
      await this.record(done, ctx.userId, 'EXECUTED');
      return done;
    } catch (error) {
      const rejected = error instanceof ActionRejectedError;
      if (!rejected) {
        this.logger.error(
          `Intelligence action ${action.id} (${action.kind}) failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      const failed = await this.prisma.intelligenceAction.update({
        where: { id: action.id },
        data: {
          status: IntelligenceActionStatus.FAILED,
          errorCode: rejected ? error.code : 'EXECUTION_FAILED',
          errorMessage: rejected
            ? error.message
            : 'No se pudo aplicar el cambio. No se modificó nada más.',
        },
      });
      await this.record(failed, ctx.userId, 'FAILED');
      return failed;
    }
  }

  private async expire(
    action: IntelligenceAction,
    code: string,
    message: string,
  ) {
    const expired = await this.prisma.intelligenceAction.update({
      where: { id: action.id },
      data: {
        status: IntelligenceActionStatus.EXPIRED,
        errorCode: code,
        errorMessage: message,
      },
    });
    await this.record(expired, action.createdByUserId, 'EXPIRED');
  }

  /** Solo quien la pidió, solo en el negocio activo: otro id es un 404. */
  private async find(scope: ConversationScope, id: string) {
    const action = await this.prisma.intelligenceAction.findFirst({
      where: {
        id,
        businessId: scope.businessId,
        createdByUserId: scope.userId,
      },
    });
    if (!action) throw new NotFoundException('Acción no encontrada');
    return action;
  }

  private view(action: IntelligenceAction, role: MembershipRole): ActionView {
    const stored = action.impact as unknown as StoredImpact;
    const impact: ActionImpact = {
      summary: stored.summary,
      before: stored.before,
      after: stored.after,
      recipients: stored.recipients,
      effectiveAt: stored.effectiveAt,
      channel: stored.channel,
      maxCost: stored.maxCost,
      risks: stored.risks,
      undo: stored.undo,
    };
    const isManager = ACTION_ROLES.includes(role);
    const pending =
      action.status === IntelligenceActionStatus.PROPOSED &&
      (!action.expiresAt || action.expiresAt > new Date());
    return {
      id: action.id,
      kind: action.kind,
      mode: action.mode,
      status: action.status,
      title: stored.title,
      impact,
      planHash: action.planHash,
      expiresAt: action.expiresAt?.toISOString() ?? null,
      createdAt: action.createdAt.toISOString(),
      decidedAt: action.decidedAt?.toISOString() ?? null,
      executedAt: action.executedAt?.toISOString() ?? null,
      result: (action.result as Record<string, unknown> | null) ?? null,
      error:
        action.errorCode && action.errorMessage
          ? { code: action.errorCode, message: action.errorMessage }
          : null,
      canConfirm: isManager && pending,
      canCancel: isManager && pending,
    };
  }

  /** Se espera: la acción no se responde sin su registro de auditoría escrito. */
  private record(action: IntelligenceAction, userId: string, verb: string) {
    return this.audit.log({
      action: `INTELLIGENCE_ACTION_${verb}`,
      entityType: 'IntelligenceAction',
      entityId: action.id,
      userId,
      businessId: action.businessId,
      metadata: {
        kind: action.kind,
        mode: action.mode,
        status: action.status,
        planHash: action.planHash,
        conversationId: action.conversationId,
        ...(action.errorCode ? { errorCode: action.errorCode } : {}),
      },
    });
  }
}

function auditVerb(mode: IntelligenceActionMode): string {
  return mode === IntelligenceActionMode.CONFIRM
    ? 'PROPOSED'
    : mode === IntelligenceActionMode.DRY_RUN
      ? 'DRY_RUN'
      : 'DRAFT_REQUESTED';
}

function rejection(error: unknown): ActionRequestOutcome {
  if (error instanceof ActionRejectedError) {
    return { ok: false, code: error.code, message: error.message };
  }
  throw error;
}

function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}

function stateConflict(action: IntelligenceAction) {
  switch (action.status) {
    case IntelligenceActionStatus.EXECUTING:
      return conflict('IN_PROGRESS', 'Este cambio se está aplicando.');
    case IntelligenceActionStatus.CANCELLED:
      return conflict('CANCELLED', 'Esta propuesta fue cancelada.');
    case IntelligenceActionStatus.EXPIRED:
      return conflict(
        'EXPIRED',
        action.errorMessage ?? 'Esta propuesta ya no es válida.',
      );
    case IntelligenceActionStatus.FAILED:
      return conflict(
        'FAILED',
        action.errorMessage ?? 'Este cambio no se pudo aplicar.',
      );
    case IntelligenceActionStatus.EXECUTED:
      return conflict('ALREADY_EXECUTED', 'Este cambio ya se aplicó.');
    default:
      return conflict('NOT_CONFIRMABLE', 'Esta acción no se puede confirmar.');
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

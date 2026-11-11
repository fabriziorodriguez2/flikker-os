import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { MembershipRole } from '@prisma/client';
import { AgentService } from './agent/agent.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import {
  ConversationScope,
  ConversationsService,
} from './conversations.service';
import {
  CreateConversationDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  SendMessageDto,
  UpdateConversationDto,
} from './dto/conversation.dto';

/**
 * Política explícita: cualquier miembro activo del negocio puede tener SUS
 * conversaciones. Ninguno ve las de otro — el aislamiento por usuario lo
 * aplica el service en cada query, no el rol. Las acciones que modifiquen el
 * negocio desde el chat van a tener su propio control de rol.
 */
export const INTELLIGENCE_CHAT_ROLES: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.OPERATOR,
  MembershipRole.VIEWER,
];

// Guards y roles a nivel de clase: un handler nuevo en este controller queda
// protegido por defecto, no por acordarse de decorarlo.
@Controller('intelligence/conversations')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Roles(...INTELLIGENCE_CHAT_ROLES)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly agent: AgentService,
  ) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateConversationDto) {
    return this.conversations.create(scopeOf(req), dto);
  }

  /** Antes de `:id`: si no, Express lo interpretaría como un id. */
  @Get('agent-status')
  agentStatus(@Req() req: AuthenticatedRequest) {
    return this.agent.availability(req.currentBusinessId!);
  }

  @Post(':id/messages')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendMessageDto,
  ) {
    const turn = await this.agent.prepare(
      scopeOf(req),
      req.currentMembershipRole!,
      id,
      {
        kind: 'message',
        content: dto.content,
      },
    );
    await streamTurn(res, this.agent, turn);
  }

  /** Vuelve a responder la última pregunta (después de un error o timeout). */
  @Post(':id/regenerate')
  async regenerate(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const turn = await this.agent.prepare(
      scopeOf(req),
      req.currentMembershipRole!,
      id,
      {
        kind: 'regenerate',
      },
    );
    await streamTurn(res, this.agent, turn);
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversations.list(scopeOf(req), query);
  }

  @Get(':id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.conversations.get(scopeOf(req), id);
  }

  @Get(':id/messages')
  listMessages(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.conversations.listMessages(scopeOf(req), id, query);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversations.update(scopeOf(req), id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.conversations.softDelete(scopeOf(req), id);
  }
}

function scopeOf(req: AuthenticatedRequest): ConversationScope {
  return { businessId: req.currentBusinessId!, userId: req.user.id };
}

const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events. Si el cliente se va, se aborta el turno pero se sigue
 * consumiendo el generador hasta el final: así el agente alcanza a guardar
 * la respuesta interrumpida.
 */
async function streamTurn(
  res: Response,
  agent: AgentService,
  turn: Awaited<ReturnType<AgentService['prepare']>>,
) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const write = (event: { type: string }) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  };

  if ('unavailable' in turn) {
    write({ type: 'unavailable', ...turn.unavailable });
    res.end();
    return;
  }

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  try {
    for await (const event of agent.stream(turn, controller.signal)) {
      write(event);
    }
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}

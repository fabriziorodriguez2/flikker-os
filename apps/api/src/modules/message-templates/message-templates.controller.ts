import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { MessageTemplatesService } from './message-templates.service';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';

@Controller('message-templates')
@UseGuards(JwtGuard, TenantGuard)
export class MessageTemplatesController {
  constructor(
    private readonly messageTemplatesService: MessageTemplatesService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateMessageTemplateDto) {
    return this.messageTemplatesService.create(req.currentBusinessId!, dto);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.messageTemplatesService.findAll(req.currentBusinessId!);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.messageTemplatesService.remove(req.currentBusinessId!, id);
  }
}

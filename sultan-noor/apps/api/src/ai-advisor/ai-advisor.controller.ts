import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiAdvisorService } from './ai-advisor.service';
import { AskAdvisorDto, StaffReplyDto } from './dto/ai-advisor.dto';

// Optional auth: guests can chat with the advisor, logged-in users get
// conversation history tied to their account. Needs OptionalJwtAuthGuard to
// actually populate req.user — without it (as before) req.user is always
// undefined and every conversation is created guest-only, even when the
// caller is logged in.
@Controller('ai-advisor')
export class AiAdvisorController {
  constructor(private aiAdvisorService: AiAdvisorService) {}

  @Post('ask')
  @UseGuards(OptionalJwtAuthGuard)
  // Each call proxies to a paid LLM API once configured — cap it well below
  // the global per-IP limit so this endpoint alone can't run up the bill.
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  ask(@Body() dto: AskAdvisorDto, @Req() req: any) {
    return this.aiAdvisorService.ask(req.user?.id, dto);
  }

  // Polled by the chat widget to pick up staff replies once escalated —
  // conversationId is an unguessable cuid, same trust model the rest of
  // this guest-facing chat already uses (see ask() above).
  @Get(':conversationId')
  getConversation(@Param('conversationId') conversationId: string) {
    return this.aiAdvisorService.getConversation(conversationId);
  }

  @Post(':conversationId/escalate')
  escalate(@Param('conversationId') conversationId: string) {
    return this.aiAdvisorService.escalate(conversationId);
  }

  @Get('staff/escalated')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  listEscalated() {
    return this.aiAdvisorService.listEscalated();
  }

  @Post(':conversationId/reply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  staffReply(@Param('conversationId') conversationId: string, @Body() dto: StaffReplyDto) {
    return this.aiAdvisorService.staffReply(conversationId, dto);
  }

  @Patch(':conversationId/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  resolve(@Param('conversationId') conversationId: string) {
    return this.aiAdvisorService.resolve(conversationId);
  }
}

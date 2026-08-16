import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AiAdvisorService } from './ai-advisor.service';
import { AskAdvisorDto } from './dto/ai-advisor.dto';

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
}

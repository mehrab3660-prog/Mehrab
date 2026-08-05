import { Body, Controller, Post, Req } from '@nestjs/common';
import { AiAdvisorService } from './ai-advisor.service';
import { AskAdvisorDto } from './dto/ai-advisor.dto';

// Optional auth: guests can chat with the advisor, logged-in users get
// conversation history tied to their account.
@Controller('ai-advisor')
export class AiAdvisorController {
  constructor(private aiAdvisorService: AiAdvisorService) {}

  @Post('ask')
  ask(@Body() dto: AskAdvisorDto, @Req() req: any) {
    return this.aiAdvisorService.ask(req.user?.id, dto);
  }
}

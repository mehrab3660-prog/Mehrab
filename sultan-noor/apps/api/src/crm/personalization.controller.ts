import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PersonalizationService } from './personalization.service';

// Customer-facing, real-auth-required. Always reads from the requester's
// own req.user.id — there is no id parameter here for a client to supply,
// so one customer can structurally never pull another customer's
// personalized recommendations (§6 privacy/IDOR).
@Controller('personalization')
@UseGuards(JwtAuthGuard)
export class PersonalizationController {
  constructor(private personalization: PersonalizationService) {}

  @Get('recommendations')
  recommendations(@Req() req: any) {
    return this.personalization.recommendationsForUser(req.user.id);
  }
}

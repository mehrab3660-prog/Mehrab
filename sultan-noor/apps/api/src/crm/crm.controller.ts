import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CustomerSegmentationService, CustomerSegment } from './customer-segmentation.service';
import { CustomerInsightsService } from './customer-insights.service';

// Staff-only throughout (§3/§6) — customer purchase history/spend/segment
// is sensitive business data, never exposed to another customer and never
// to an unauthenticated caller.
@Controller('crm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class CrmController {
  constructor(
    private segmentation: CustomerSegmentationService,
    private insights: CustomerInsightsService,
  ) {}

  @Get('segments')
  segmentCounts() {
    return this.segmentation.segmentCounts();
  }

  @Get('customers')
  list(@Query('segment') segment?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.segmentation.list(segment as CustomerSegment | undefined, skip ? Number(skip) : undefined, take ? Number(take) : undefined);
  }

  // :userId is an explicit path param the staff member chooses — never
  // derived from the requester's own session, and only ever reachable
  // through the staff-only guards above.
  @Get('customers/:userId')
  insightsFor(@Param('userId') userId: string) {
    return this.insights.insightsFor(userId);
  }
}

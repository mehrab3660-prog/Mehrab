import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApprovalCenterService, ApprovalItemType } from './approval-center.service';
import { AiActivityLogService } from './ai-activity-log.service';
import { RejectApprovalItemDto } from './dto/approval-center.dto';

// Staff-only throughout — this is the single hub for every pending
// AI-generated suggestion/draft across the store, plus the real AI activity
// log (§11/§12). Every approve/reject call here delegates to that domain's
// own already-tested service — no approval logic is duplicated.
@Controller('approval-center')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class ApprovalCenterController {
  constructor(
    private approvalCenter: ApprovalCenterService,
    private activityLog: AiActivityLogService,
  ) {}

  @Get()
  list() {
    return this.approvalCenter.list();
  }

  @Get('activity-log')
  activity(@Query('limit') limit?: string) {
    return this.activityLog.list(limit ? Number(limit) : undefined);
  }

  @Post(':type/:id/approve')
  approve(@Param('type') type: string, @Param('id') id: string, @Req() req: any) {
    return this.approvalCenter.approve(type as ApprovalItemType, id, req.user.id);
  }

  @Post(':type/:id/reject')
  reject(@Param('type') type: string, @Param('id') id: string, @Body() dto: RejectApprovalItemDto, @Req() req: any) {
    return this.approvalCenter.reject(type as ApprovalItemType, id, dto.reason, req.user.id);
  }
}

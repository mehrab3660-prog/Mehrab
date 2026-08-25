import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ContentAutopilotService } from './content-autopilot.service';
import { ApproveContentDraftDto, GenerateContentDraftDto, RejectContentDraftDto, UpdateContentDraftDto } from './dto/content-draft.dto';

// Every route here is staff-only — content only ever reaches the public
// site through approve(publish: true) or publish(), both explicit actions.
@Controller('content-drafts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class ContentAutopilotController {
  constructor(private content: ContentAutopilotService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.content.list(status);
  }

  @Get(':id')
  getDraft(@Param('id') id: string) {
    return this.content.getDraft(id);
  }

  @Post('generate')
  generate(@Body() dto: GenerateContentDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.content.generate(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.content.update(id, dto, user.id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectContentDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.content.reject(id, dto.reason, user.id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveContentDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.content.approve(id, dto, user.id);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.content.publish(id, user.id);
  }
}

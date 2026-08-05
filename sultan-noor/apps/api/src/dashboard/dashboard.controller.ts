import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboardService.summary();
  }

  @Get('sales-by-day')
  salesByDay(@Query('days') days?: string) {
    return this.dashboardService.salesByDay(days ? Number(days) : undefined);
  }
}

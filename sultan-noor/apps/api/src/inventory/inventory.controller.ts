import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { InventoryForecastService } from './inventory-forecast.service';
import { ReorderRecommendationService } from './reorder-recommendation.service';
import { RejectReorderRecommendationDto } from './dto/inventory.dto';

// Staff-only throughout — stock/sales-velocity numbers and reorder
// suggestions are internal business data, same trust boundary as the rest
// of the admin dashboard.
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF, Role.WAREHOUSE_MANAGER)
export class InventoryController {
  constructor(
    private forecastService: InventoryForecastService,
    private reorderService: ReorderRecommendationService,
  ) {}

  @Get('forecast')
  forecast(@Query('days') days?: string) {
    return this.forecastService.forecast(days ? Number(days) : undefined);
  }

  @Post('reorder-recommendations/generate')
  generate(@Query('days') days?: string) {
    return this.reorderService.generate(days ? Number(days) : undefined);
  }

  @Get('reorder-recommendations')
  list(@Query('status') status?: string) {
    return this.reorderService.list(status);
  }

  @Get('reorder-recommendations/:id')
  getById(@Param('id') id: string) {
    return this.reorderService.getById(id);
  }

  @Post('reorder-recommendations/:id/approve')
  approve(@Param('id') id: string, @Req() req: any) {
    return this.reorderService.approve(id, req.user.id);
  }

  @Post('reorder-recommendations/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectReorderRecommendationDto, @Req() req: any) {
    return this.reorderService.reject(id, dto.reason, req.user.id);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SalesAnalyticsService } from './sales-analytics.service';
import { ProductOpportunitiesService } from './product-opportunities.service';
import { AbandonedCartInsightService } from './abandoned-cart-insight.service';
import { SalesRecommendationService } from './sales-recommendation.service';
import { GenerateCampaignDto, GenerateDiscountDto, RejectSalesRecommendationDto, UpdateSalesRecommendationDto } from './dto/sales-recommendation.dto';

// Every route here is staff-only. Reading analytics/opportunities never
// exposes anything not already visible to staff elsewhere in the admin
// panel; mutating routes never touch real price/discount/campaign/inventory
// state — see SalesRecommendationService for why.
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class SalesAutopilotController {
  constructor(
    private analytics: SalesAnalyticsService,
    private opportunities: ProductOpportunitiesService,
    private abandonedCart: AbandonedCartInsightService,
    private recommendations: SalesRecommendationService,
  ) {}

  @Get('analytics')
  getAnalytics(@Query('days') days?: string) {
    return this.analytics.overview(days ? Number(days) : undefined);
  }

  @Get('opportunities/low-stock-bestsellers')
  lowStockBestsellers() {
    return this.opportunities.bestSellingLowStock();
  }

  @Get('opportunities/high-demand-low-stock')
  highDemandLowStock() {
    return this.opportunities.highDemandLowStock();
  }

  @Get('opportunities/stale-inventory')
  staleInventory() {
    return this.opportunities.staleInventory();
  }

  @Get('opportunities/cross-sell-pairs')
  crossSellPairs() {
    return this.opportunities.crossSellPairs();
  }

  @Get('abandoned-carts')
  abandonedCarts() {
    return this.abandonedCart.summary();
  }

  @Get('recommendations')
  list(@Query('status') status?: string, @Query('type') type?: string) {
    return this.recommendations.list(status, type);
  }

  @Get('recommendations/:id')
  getOne(@Param('id') id: string) {
    return this.recommendations.getById(id);
  }

  @Post('recommendations/cross-sell/generate')
  generateCrossSell(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.generateCrossSellDrafts(user.id);
  }

  @Post('recommendations/bundle/generate')
  generateBundle(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.generateBundleDrafts(user.id);
  }

  @Post('recommendations/abandoned-cart/generate')
  generateAbandonedCart(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.generateAbandonedCartSuggestion(user.id);
  }

  @Post('recommendations/discount/generate')
  generateDiscount(@Body() dto: GenerateDiscountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.generateDiscount(dto, user.id);
  }

  @Post('recommendations/campaign/generate')
  generateCampaign(@Body() dto: GenerateCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.generateCampaign(dto, user.id);
  }

  @Patch('recommendations/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSalesRecommendationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.update(id, dto, user.id);
  }

  @Post('recommendations/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.approve(id, user.id);
  }

  @Post('recommendations/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectSalesRecommendationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.reject(id, dto.reason, user.id);
  }

  @Post('recommendations/:id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.activate(id, user.id);
  }
}

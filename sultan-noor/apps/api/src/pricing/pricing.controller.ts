import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PricingService } from './pricing.service';
import { CreateDiscountCodeDto } from './dto/discount-code.dto';
import { UpsertPriceTierDto } from './dto/price-tier.dto';
import { CreateCustomerGroupDto } from './dto/customer-group.dto';

@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class PricingController {
  constructor(private pricingService: PricingService) {}

  @Get('customer-groups')
  listCustomerGroups() {
    return this.pricingService.listCustomerGroups();
  }

  @Post('customer-groups')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  createCustomerGroup(@Body() dto: CreateCustomerGroupDto) {
    return this.pricingService.createCustomerGroup(dto);
  }

  @Get('price-tiers')
  listPriceTiers(@Query('productId') productId: string) {
    return this.pricingService.listPriceTiers(productId);
  }

  @Post('price-tiers')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  upsertPriceTier(@Body() dto: UpsertPriceTierDto) {
    return this.pricingService.upsertPriceTier(dto);
  }

  @Delete('price-tiers/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  removePriceTier(@Param('id') id: string) {
    return this.pricingService.removePriceTier(id);
  }

  @Get('discount-codes')
  listDiscountCodes() {
    return this.pricingService.listDiscountCodes();
  }

  @Post('discount-codes')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  createDiscountCode(@Body() dto: CreateDiscountCodeDto) {
    return this.pricingService.createDiscountCode(dto);
  }

  @Patch('discount-codes/:id/deactivate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  deactivateDiscountCode(@Param('id') id: string) {
    return this.pricingService.deactivateDiscountCode(id);
  }
}

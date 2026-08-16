import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ShippingService } from './shipping.service';
import { CreateShippingRateDto } from './dto/shipping-rate.dto';

@Controller('shipping/rates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class ShippingController {
  constructor(private shippingService: ShippingService) {}

  @Get()
  list() {
    return this.shippingService.list();
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(@Body() dto: CreateShippingRateDto) {
    return this.shippingService.create(dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.shippingService.remove(id);
  }
}

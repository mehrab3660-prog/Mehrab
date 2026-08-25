import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto, AdjustStockDto } from './dto/warehouse.dto';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.WAREHOUSE_MANAGER, Role.STAFF)
export class WarehousesController {
  constructor(private warehousesService: WarehousesService) {}

  @Get()
  list() {
    return this.warehousesService.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.warehousesService.get(id);
  }

  @Get(':id/stock')
  stockLevels(@Param('id') id: string) {
    return this.warehousesService.stockLevels(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Post(':id/stock/adjust')
  adjustStock(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.warehousesService.adjustStock(user.id, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.warehousesService.remove(id);
  }
}

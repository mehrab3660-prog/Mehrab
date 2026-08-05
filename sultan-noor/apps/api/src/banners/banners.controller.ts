import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role, BannerPlacement } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BannersService } from './banners.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

@Controller('banners')
export class BannersController {
  constructor(private bannersService: BannersService) {}

  @Get()
  listActive(@Query('placement') placement?: BannerPlacement) {
    return this.bannersService.listActive(placement);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  listAll() {
    return this.bannersService.listAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  create(@Body() dto: CreateBannerDto) {
    return this.bannersService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.bannersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }
}

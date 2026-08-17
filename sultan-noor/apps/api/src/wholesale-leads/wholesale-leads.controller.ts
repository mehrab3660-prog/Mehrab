import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { WholesaleLeadsService } from './wholesale-leads.service';
import { CreateWholesaleLeadDto, UpdateWholesaleLeadStatusDto } from './dto/wholesale-lead.dto';

@Controller('wholesale-leads')
export class WholesaleLeadsController {
  constructor(private wholesaleLeadsService: WholesaleLeadsService) {}

  @Post()
  create(@Body() dto: CreateWholesaleLeadDto) {
    return this.wholesaleLeadsService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  listAll(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.wholesaleLeadsService.listAll(skip ? Number(skip) : undefined, take ? Number(take) : undefined);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateWholesaleLeadStatusDto) {
    return this.wholesaleLeadsService.updateStatus(id, dto);
  }
}

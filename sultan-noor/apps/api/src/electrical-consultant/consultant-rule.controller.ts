import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ConsultantRuleService } from './consultant-rule.service';
import { CreateConsultantItemRuleDto, UpdateConsultantItemRuleDto } from './dto/consultant.dto';

// Admin control over the Smart Electrical Consultant's calculation rules
// (Sprint 7 §12) — staff-only, same guard pattern as every other admin CRUD
// surface (News sources, Sales rules, etc.).
@Controller('admin/consultant-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class ConsultantRuleController {
  constructor(private rules: ConsultantRuleService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.rules.getById(id);
  }

  @Post()
  create(@Body() dto: CreateConsultantItemRuleDto, @Req() req: any) {
    return this.rules.create(dto, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConsultantItemRuleDto, @Req() req: any) {
    return this.rules.update(id, dto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.rules.remove(id, req.user.id);
  }
}

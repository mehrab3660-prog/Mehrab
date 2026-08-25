import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AiProductService } from './ai-product.service';
import { ApproveProductDraftDto, PrepareProductDraftDto, ProductDraftFieldsDto, RejectProductDraftDto } from './dto/ai-product.dto';

// Every route here is staff-only — this whole feature only ever drafts
// content for a human to review; nothing is reachable by a customer.
@Controller('ai-product')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class AiProductController {
  constructor(private aiProduct: AiProductService) {}

  @Get('drafts')
  listDrafts(@Query('status') status?: string) {
    return this.aiProduct.listDrafts(status);
  }

  @Get('drafts/:id')
  getDraft(@Param('id') id: string) {
    return this.aiProduct.getDraft(id);
  }

  @Post('prepare')
  prepare(@Body() dto: PrepareProductDraftDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.aiProduct.prepare(dto, user.id, `${req.protocol}://${req.get('host')}`);
  }

  @Patch('drafts/:id')
  update(@Param('id') id: string, @Body() dto: ProductDraftFieldsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiProduct.update(id, dto, user.id);
  }

  @Post('drafts/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectProductDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiProduct.reject(id, dto.reason, user.id);
  }

  @Post('drafts/:id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveProductDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiProduct.approve(id, dto, user.id);
  }
}

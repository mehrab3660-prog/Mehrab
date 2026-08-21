import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NewsSourceService } from './news-source.service';
import { NewsVerificationService } from './news-verification.service';
import { NewsContentService } from './news-content.service';
import { CreateNewsSourceDto, RejectNewsItemDto, UpdateNewsItemDto, UpdateNewsSourceDto } from './dto/news.dto';

// Every route here is staff-only. Nothing here is ever visible to a
// customer until publish() writes it into the real, public BlogPost table.
@Controller('news')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class NewsController {
  constructor(
    private sources: NewsSourceService,
    private verification: NewsVerificationService,
    private content: NewsContentService,
  ) {}

  @Get('sources')
  listSources() {
    return this.sources.list();
  }

  @Post('sources')
  createSource(@Body() dto: CreateNewsSourceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sources.create(dto, user.id);
  }

  @Patch('sources/:id')
  updateSource(@Param('id') id: string, @Body() dto: UpdateNewsSourceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sources.update(id, dto, user.id);
  }

  @Post('discover')
  discover(@CurrentUser() user: AuthenticatedUser) {
    return this.sources.discover(user.id);
  }

  @Post('verify')
  verify(@CurrentUser() user: AuthenticatedUser) {
    return this.verification.verify(user.id);
  }

  @Get('items')
  list(@Query('status') status?: string) {
    return this.content.list(status);
  }

  @Get('items/:id')
  getOne(@Param('id') id: string) {
    return this.content.getById(id);
  }

  @Post('items/:id/generate-draft')
  generateDraft(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return this.content.generateDraft(id, user.id, baseUrl);
  }

  @Patch('items/:id')
  update(@Param('id') id: string, @Body() dto: UpdateNewsItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.content.update(id, dto, user.id);
  }

  @Post('items/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectNewsItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.content.reject(id, dto.reason, user.id);
  }

  @Post('items/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.content.approve(id, user.id);
  }

  @Post('items/:id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.content.publish(id, user.id);
  }
}

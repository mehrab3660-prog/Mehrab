import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SeoAuditService } from './seo-audit.service';
import { SeoSuggestionService } from './seo-suggestion.service';
import { RejectSeoSuggestionDto, UpdateSeoSuggestionDto } from './dto/seo-suggestion.dto';

// Every route here is staff-only. Reading the audit or a suggestion never
// exposes anything not already visible to staff elsewhere in the admin panel.
@Controller('seo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class SeoAutopilotController {
  constructor(
    private seoAudit: SeoAuditService,
    private seoSuggestion: SeoSuggestionService,
  ) {}

  @Get('audit')
  audit() {
    return this.seoAudit.run();
  }

  @Get('products/:productId/suggestions')
  listForProduct(@Param('productId') productId: string) {
    return this.seoSuggestion.listForProduct(productId);
  }

  @Post('products/:productId/suggestions')
  generate(@Param('productId') productId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.seoSuggestion.generate(productId, user.id);
  }

  @Get('suggestions/:id')
  getSuggestion(@Param('id') id: string) {
    return this.seoSuggestion.getSuggestion(id);
  }

  @Patch('suggestions/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSeoSuggestionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.seoSuggestion.update(id, dto, user.id);
  }

  @Post('suggestions/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.seoSuggestion.approve(id, user.id);
  }

  @Post('suggestions/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectSeoSuggestionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.seoSuggestion.reject(id, dto.reason, user.id);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ElectricalConsultantService } from './electrical-consultant.service';
import { AddConsultationToCartDto, SetConsultationPreferencesDto, UpdateConsultationInputDto } from './dto/consultant.dto';

// Guests can start and run a consultation (same optional-auth trust model as
// AiAdvisorController) — only listing history and actually adding to a real
// cart require a real signed-in user, since both a personal history and a
// cart are inherently account-scoped.
@Controller('electrical-consultant')
export class ElectricalConsultantController {
  constructor(private consultant: ElectricalConsultantService) {}

  @Post('start')
  @UseGuards(OptionalJwtAuthGuard)
  start(@Req() req: any) {
    return this.consultant.start(req.user?.id);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@Req() req: any) {
    return this.consultant.listMine(req.user.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  getById(@Param('id') id: string, @Req() req: any) {
    return this.consultant.getById(id, req.user?.id);
  }

  @Patch(':id/input')
  @UseGuards(OptionalJwtAuthGuard)
  updateInput(@Param('id') id: string, @Body() dto: UpdateConsultationInputDto, @Req() req: any) {
    return this.consultant.updateInput(id, dto, req.user?.id);
  }

  @Post(':id/preferences')
  @UseGuards(OptionalJwtAuthGuard)
  setPreferences(@Param('id') id: string, @Body() dto: SetConsultationPreferencesDto, @Req() req: any) {
    return this.consultant.setPreferences(id, dto, req.user?.id);
  }

  @Post(':id/generate')
  @UseGuards(OptionalJwtAuthGuard)
  generate(@Param('id') id: string, @Req() req: any) {
    return this.consultant.generatePackages(id, req.user?.id);
  }

  @Post(':id/add-to-cart')
  @UseGuards(JwtAuthGuard)
  addToCart(@Param('id') id: string, @Body() dto: AddConsultationToCartDto, @Req() req: any) {
    return this.consultant.addToCart(id, dto, req.user.id);
  }
}

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { QaService } from './qa.service';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qa.dto';
import { Role } from '@prisma/client';

@Controller('qa')
export class QaController {
  constructor(private qaService: QaService) {}

  @Get('questions/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  listAll() {
    return this.qaService.listAll();
  }

  @Get('questions')
  listForProduct(@Query('productId') productId: string) {
    return this.qaService.listForProduct(productId);
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard)
  createQuestion(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQuestionDto) {
    return this.qaService.createQuestion(user.id, dto);
  }

  @Post('questions/:id/suggest-answer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  suggestAnswer(@Param('id') id: string) {
    return this.qaService.suggestAnswer(id);
  }

  @Post('questions/:id/answers')
  @UseGuards(JwtAuthGuard)
  createAnswer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateAnswerDto) {
    return this.qaService.createAnswer(user.id, user.role as Role, id, dto);
  }
}

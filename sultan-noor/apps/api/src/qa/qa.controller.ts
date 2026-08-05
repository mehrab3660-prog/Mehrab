import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { QaService } from './qa.service';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qa.dto';
import { Role } from '@prisma/client';

@Controller('qa')
export class QaController {
  constructor(private qaService: QaService) {}

  @Get('questions')
  listForProduct(@Query('productId') productId: string) {
    return this.qaService.listForProduct(productId);
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard)
  createQuestion(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQuestionDto) {
    return this.qaService.createQuestion(user.id, dto);
  }

  @Post('questions/:id/answers')
  @UseGuards(JwtAuthGuard)
  createAnswer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateAnswerDto) {
    return this.qaService.createAnswer(user.id, user.role as Role, id, dto);
  }
}

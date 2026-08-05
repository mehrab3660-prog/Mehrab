import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { InvoiceService } from './invoice/invoice.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF];

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private ordersService: OrdersService,
    private invoiceService: InvoiceService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createFromCart(user.id, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.listForUser(user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  listAll(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.ordersService.listAll(skip ? Number(skip) : undefined, take ? Number(take) : undefined);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.get(user.id, id, STAFF_ROLES.includes(user.role as Role));
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  updateStatus(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(admin.id, id, dto);
  }

  @Post(':id/invoice')
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  generateInvoice(@Param('id') id: string) {
    return this.invoiceService.generateForOrder(id);
  }

  @Get(':id/invoice/download')
  async downloadInvoice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    // Reuses the same ownership/staff check as GET /orders/:id — never trust
    // the order id alone.
    const order = await this.ordersService.get(user.id, id, STAFF_ROLES.includes(user.role as Role));
    if (!order.invoice) throw new NotFoundException('فاکتور هنوز صادر نشده است');

    const filePath = this.invoiceService.getFilePath(order.invoice.invoiceNumber);
    if (!fs.existsSync(filePath)) throw new NotFoundException('فایل فاکتور یافت نشد');

    res.download(filePath, `${order.invoice.invoiceNumber}.pdf`);
  }
}

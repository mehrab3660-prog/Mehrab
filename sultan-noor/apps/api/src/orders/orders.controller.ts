import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
}

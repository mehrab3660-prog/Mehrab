import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  addItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:itemId')
  updateItem(@CurrentUser() user: AuthenticatedUser, @Param('itemId') itemId: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(user.id, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(@CurrentUser() user: AuthenticatedUser, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(user.id, itemId);
  }

  @Delete()
  clear(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.clear(user.id);
  }
}

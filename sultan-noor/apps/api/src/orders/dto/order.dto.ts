import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class CreateOrderDto {
  @IsString()
  addressId: string;

  @IsOptional()
  @IsString()
  discountCode?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

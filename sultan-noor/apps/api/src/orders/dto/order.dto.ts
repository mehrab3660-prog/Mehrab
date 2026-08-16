import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { DeliverySlot, OrderStatus } from '@prisma/client';

export class CreateOrderDto {
  @IsString()
  addressId: string;

  @IsOptional()
  @IsString()
  discountCode?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsEnum(DeliverySlot)
  deliverySlot?: DeliverySlot;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

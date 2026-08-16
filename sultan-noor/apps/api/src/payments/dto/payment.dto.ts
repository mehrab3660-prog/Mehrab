import { IsIn, IsOptional, IsString } from 'class-validator';

export class InitiatePaymentDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsIn(['ZARINPAL', 'CASH_ON_DELIVERY'])
  gateway?: 'ZARINPAL' | 'CASH_ON_DELIVERY';
}

export class VerifyPaymentDto {
  @IsString()
  authority: string;

  @IsString()
  orderId: string;
}

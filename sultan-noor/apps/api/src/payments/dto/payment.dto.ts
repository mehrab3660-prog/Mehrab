import { IsIn, IsOptional, IsString } from 'class-validator';

export class InitiatePaymentDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsIn(['ZARINPAL', 'IDPAY', 'CASH_ON_DELIVERY'])
  gateway?: 'ZARINPAL' | 'IDPAY' | 'CASH_ON_DELIVERY';
}

export class VerifyPaymentDto {
  @IsString()
  authority: string;

  @IsString()
  orderId: string;
}

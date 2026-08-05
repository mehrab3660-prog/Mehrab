import { IsString } from 'class-validator';

export class InitiatePaymentDto {
  @IsString()
  orderId: string;
}

export class VerifyPaymentDto {
  @IsString()
  authority: string;

  @IsString()
  orderId: string;
}

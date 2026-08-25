import { IsEnum, IsPhoneNumber } from 'class-validator';
import { OtpPurpose } from '@prisma/client';

export class RequestOtpDto {
  @IsPhoneNumber('IR')
  phone: string;

  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;
}

import { IsEnum, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { OtpPurpose, CustomerType } from '@prisma/client';

export class VerifyOtpDto {
  @IsPhoneNumber('IR')
  phone: string;

  @IsString()
  @Length(4, 8)
  code: string;

  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsString()
  companyName?: string;
}

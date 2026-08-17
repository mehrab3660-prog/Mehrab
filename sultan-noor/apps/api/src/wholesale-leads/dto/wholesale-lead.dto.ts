import { IsEmail, IsEnum, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';
import { WholesaleLeadStatus } from '@prisma/client';

export class CreateWholesaleLeadDto {
  @IsString()
  @MinLength(2)
  companyName: string;

  @IsString()
  @MinLength(2)
  contactName: string;

  @IsPhoneNumber('IR')
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(10)
  message: string;
}

export class UpdateWholesaleLeadStatusDto {
  @IsEnum(WholesaleLeadStatus)
  status: WholesaleLeadStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;
}

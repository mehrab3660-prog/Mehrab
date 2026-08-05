import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { DiscountType } from '@prisma/client';

export class CreateDiscountCodeDto {
  @IsString()
  code: string;

  @IsEnum(DiscountType)
  type: DiscountType;

  @IsNumber()
  value: number;

  @IsOptional()
  @IsNumber()
  minOrderTotal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsagePerUser?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ApplyDiscountCodeDto {
  @IsString()
  code: string;
}

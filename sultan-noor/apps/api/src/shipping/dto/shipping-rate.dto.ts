import { IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateShippingRateDto {
  @IsOptional()
  @IsString()
  province?: string;

  @IsInt()
  @IsPositive()
  maxWeightGrams: number;

  @IsNumber()
  @IsPositive()
  price: number;
}

export class UpdateShippingRateDto {
  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxWeightGrams?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;
}

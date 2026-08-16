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

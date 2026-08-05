import { IsInt, IsNumber, IsString, Min } from 'class-validator';

export class UpsertPriceTierDto {
  @IsString()
  productId: string;

  @IsString()
  customerGroupId: string;

  @IsInt()
  @Min(1)
  minQuantity: number;

  @IsNumber()
  unitPrice: number;
}

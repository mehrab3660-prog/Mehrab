import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdjustStockDto {
  @IsString()
  productVariantId: string;

  @IsInt()
  quantityDelta: number;
}

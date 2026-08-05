import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class ProductVariantInputDto {
  @IsString()
  sku: string;

  attributes: Record<string, string>;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsInt()
  weightGrams?: number;
}

export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsNumber()
  basePrice: number;

  @IsOptional()
  @IsNumber()
  compareAtPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minWholesaleQty?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @IsNumber()
  compareAtPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minWholesaleQty?: number;
}

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  take?: number;
}

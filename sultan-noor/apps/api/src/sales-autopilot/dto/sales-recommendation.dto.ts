import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class GenerateDiscountDto {
  @IsString()
  productId: string;
}

export class GenerateCampaignDto {
  @IsString()
  topic: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  keywords?: string;
}

export class UpdateSalesRecommendationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class RejectSalesRecommendationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

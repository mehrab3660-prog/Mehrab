import { IsBoolean, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class PrepareProductDraftDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  modelNumber?: string;

  @IsNumber()
  ownerPrice: number;
}

// Shared editable fields — used both while a draft is still pending review
// (PATCH) and to let staff override AI output at the moment of approval.
export class ProductDraftFieldsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  specs?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  faq?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsNumber()
  suggestedPrice?: number;
}

export class RejectProductDraftDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ApproveProductDraftDto extends ProductDraftFieldsDto {
  // true → creates the live Product as PUBLISHED ("تأیید و انتشار").
  // false → creates it as DRAFT, hidden from the storefront ("ذخیره به‌عنوان پیش‌نویس").
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

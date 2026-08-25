import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ContentDraftType } from '@prisma/client';

export class GenerateContentDraftDto {
  @IsEnum(ContentDraftType)
  type: ContentDraftType;

  @IsString()
  topic: string;

  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class UpdateContentDraftDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsObject()
  faq?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  suggestedImagePrompt?: string;
}

export class RejectContentDraftDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ApproveContentDraftDto extends UpdateContentDraftDto {
  // true → publishes immediately ("تأیید و انتشار"); false → marks APPROVED
  // without publishing anything ("ذخیره به‌عنوان پیش‌نویس") — publish() can
  // promote it later.
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

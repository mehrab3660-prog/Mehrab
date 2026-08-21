import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSeoSuggestionDto {
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  searchKeywords?: string;

  @IsOptional()
  @IsString()
  descriptionSuggestion?: string;

  @IsOptional()
  @IsObject()
  faq?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  altTextSuggestions?: Record<string, string>;
}

export class RejectSeoSuggestionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

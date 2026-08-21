import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateNewsSourceDto {
  @IsString()
  name: string;

  @IsString()
  feedUrl: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateNewsSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  feedUrl?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNewsItemDto {
  @IsOptional()
  @IsString()
  draftTitle?: string;

  @IsOptional()
  @IsString()
  draftExcerpt?: string;

  @IsOptional()
  @IsString()
  draftBody?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  keywords?: string;
}

export class RejectNewsItemDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

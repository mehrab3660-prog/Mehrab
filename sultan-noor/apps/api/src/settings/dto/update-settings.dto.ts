import { IsOptional, IsString } from 'class-validator';

// Every field is optional and independent: a field absent from the request
// body is left untouched, an empty string explicitly clears it (falls back
// to the env var again), and any other value overwrites it.
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  zarinpalMerchantId?: string;

  @IsOptional()
  @IsString()
  idpayApiKey?: string;

  @IsOptional()
  @IsString()
  smsApiKey?: string;

  @IsOptional()
  @IsString()
  kavenegarOtpTemplate?: string;

  @IsOptional()
  @IsString()
  melipayamakApiKey?: string;

  @IsOptional()
  @IsString()
  melipayamakSender?: string;

  @IsOptional()
  @IsString()
  anthropicApiKey?: string;

  @IsOptional()
  @IsString()
  anthropicModel?: string;

  @IsOptional()
  @IsString()
  openaiApiKey?: string;

  @IsOptional()
  @IsString()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  imageSearchProvider?: string;

  @IsOptional()
  @IsString()
  imageSearchApiKey?: string;

  @IsOptional()
  @IsString()
  removeBgApiKey?: string;

  @IsOptional()
  @IsString()
  imageGenerationProvider?: string;

  @IsOptional()
  @IsString()
  imageAutopilotMonthlyBudgetToman?: string;

  @IsOptional()
  @IsString()
  seoAutoFixEnabled?: string;

  @IsOptional()
  @IsString()
  seoContentMonthlyBudgetToman?: string;

  @IsOptional()
  @IsString()
  salesAiMonthlyBudgetToman?: string;

  @IsOptional()
  @IsString()
  newsMonthlyBudgetToman?: string;

  @IsOptional()
  @IsString()
  storeAiEnabled?: string;

  @IsOptional()
  @IsString()
  storeAiMaxResults?: string;

  @IsOptional()
  @IsString()
  storeAiMonthlyBudgetToman?: string;

  @IsOptional()
  @IsString()
  storeAiRateLimitPerMinute?: string;

  @IsOptional()
  @IsString()
  storeAiAllowAddToCart?: string;

  @IsOptional()
  @IsString()
  storeAiStrictCatalogOnly?: string;

  @IsOptional()
  @IsString()
  electricalConsultantEnabled?: string;

  @IsOptional()
  @IsString()
  aiAutonomousMode?: string;

  @IsOptional()
  @IsString()
  ownerReportAiSummaryEnabled?: string;

  @IsOptional()
  @IsString()
  ownerReportAiMonthlyBudgetToman?: string;
}

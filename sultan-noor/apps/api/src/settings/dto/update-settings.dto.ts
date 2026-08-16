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
  smsApiKey?: string;

  @IsOptional()
  @IsString()
  kavenegarOtpTemplate?: string;

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
}

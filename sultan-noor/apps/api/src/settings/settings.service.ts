import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

type SettingKey =
  | 'zarinpalMerchantId'
  | 'idpayApiKey'
  | 'smsApiKey'
  | 'kavenegarOtpTemplate'
  | 'melipayamakApiKey'
  | 'melipayamakSender'
  | 'anthropicApiKey'
  | 'anthropicModel'
  | 'openaiApiKey'
  | 'siteUrl'
  | 'imageSearchProvider'
  | 'imageSearchApiKey'
  | 'removeBgApiKey'
  | 'imageGenerationProvider'
  | 'imageAutopilotMonthlyBudgetToman'
  | 'seoAutoFixEnabled'
  | 'seoContentMonthlyBudgetToman'
  | 'salesAiMonthlyBudgetToman'
  | 'newsMonthlyBudgetToman'
  | 'storeAiEnabled'
  | 'storeAiMaxResults'
  | 'storeAiMonthlyBudgetToman'
  | 'storeAiRateLimitPerMinute'
  | 'storeAiAllowAddToCart'
  | 'storeAiStrictCatalogOnly';

// Maps each DB-backed setting to the env var it falls back to when unset —
// existing .env-based deployments keep working unchanged.
const ENV_FALLBACK: Record<SettingKey, string> = {
  zarinpalMerchantId: 'ZARINPAL_MERCHANT_ID',
  idpayApiKey: 'IDPAY_API_KEY',
  smsApiKey: 'SMS_API_KEY',
  kavenegarOtpTemplate: 'KAVENEGAR_OTP_TEMPLATE',
  melipayamakApiKey: 'MELIPAYAMAK_API_KEY',
  melipayamakSender: 'MELIPAYAMAK_SENDER',
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  anthropicModel: 'ANTHROPIC_MODEL',
  openaiApiKey: 'OPENAI_API_KEY',
  siteUrl: 'WEB_ORIGIN',
  imageSearchProvider: 'IMAGE_SEARCH_PROVIDER',
  imageSearchApiKey: 'IMAGE_SEARCH_API_KEY',
  removeBgApiKey: 'REMOVE_BG_API_KEY',
  imageGenerationProvider: 'IMAGE_GENERATION_PROVIDER',
  imageAutopilotMonthlyBudgetToman: 'IMAGE_AUTOPILOT_MONTHLY_BUDGET_TOMAN',
  seoAutoFixEnabled: 'SEO_AUTO_FIX_ENABLED',
  seoContentMonthlyBudgetToman: 'SEO_CONTENT_MONTHLY_BUDGET_TOMAN',
  salesAiMonthlyBudgetToman: 'SALES_AI_MONTHLY_BUDGET_TOMAN',
  newsMonthlyBudgetToman: 'NEWS_MONTHLY_BUDGET_TOMAN',
  storeAiEnabled: 'STORE_AI_ENABLED',
  storeAiMaxResults: 'STORE_AI_MAX_RESULTS',
  storeAiMonthlyBudgetToman: 'STORE_AI_MONTHLY_BUDGET_TOMAN',
  storeAiRateLimitPerMinute: 'STORE_AI_RATE_LIMIT_PER_MINUTE',
  storeAiAllowAddToCart: 'STORE_AI_ALLOW_ADD_TO_CART',
  storeAiStrictCatalogOnly: 'STORE_AI_STRICT_CATALOG_ONLY',
};

const SECRET_KEYS: SettingKey[] = [
  'zarinpalMerchantId',
  'idpayApiKey',
  'smsApiKey',
  'melipayamakApiKey',
  'anthropicApiKey',
  'openaiApiKey',
  'imageSearchApiKey',
  'removeBgApiKey',
];

function mask(value: string): string {
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  private async getRow() {
    return this.prisma.appSettings.findUnique({ where: { id: 1 } });
  }

  // Effective value for a given setting: DB override first, then the
  // matching env var, exactly like every consuming service used to read it.
  async resolve(key: SettingKey): Promise<string | undefined> {
    const row = await this.getRow();
    const dbValue = row?.[key];
    if (dbValue) return dbValue;
    const envValue = process.env[ENV_FALLBACK[key]];
    return envValue || undefined;
  }

  // Never returns raw secret values — only whether each is configured (and
  // from where), plus a masked preview for secrets and the real value for
  // non-secret settings (e.g. the Kavenegar template name, site URL).
  async getMasked() {
    const row = await this.getRow();
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(ENV_FALLBACK) as SettingKey[]) {
      const dbValue = row?.[key];
      const envValue = process.env[ENV_FALLBACK[key]];
      const effective = dbValue || envValue;
      const source = dbValue ? 'dashboard' : envValue ? 'env' : null;
      result[key] = {
        configured: !!effective,
        source,
        preview: effective ? (SECRET_KEYS.includes(key) ? mask(effective) : effective) : null,
      };
    }
    return result;
  }

  async update(dto: UpdateSettingsDto) {
    await this.prisma.appSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...dto },
      update: dto,
    });
    return this.getMasked();
  }
}

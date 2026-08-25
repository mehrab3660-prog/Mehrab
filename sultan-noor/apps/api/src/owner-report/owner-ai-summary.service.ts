import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { OwnerReportAiUsageService } from '../ai-usage/owner-report-ai-usage.service';

const APPROXIMATE_COST_TOMAN = 150;

// Sprint 8 §8 — "AI فقط اعداد واقعی محاسبه‌شده توسط Backend را توضیح می‌دهد،
// هرگز خودش عدد نمی‌سازد." The system prompt enforces this in both
// directions: it forbids inventing any number not present in the payload,
// and it forbids suggesting any executable action (price/discount/stock/
// campaign) — this is narration only, never a new recommendation.
const SYSTEM_PROMPT = `شما فقط اعداد واقعی زیر را که توسط بک‌اند فروشگاه «سلطان نور» محاسبه شده‌اند، به زبان فارسی ساده و روان برای مالک فروشگاه توضیح می‌دهید.
هرگز هیچ عدد، آمار یا واقعیتی که در داده داده‌شده نیست را نسازید یا حدس نزنید.
شما اجازه‌ی محاسبه‌ی هیچ عددی را ندارید — فقط اعداد داده‌شده را توضیح می‌دهید.
هرگز پیشنهاد اجرایی جدید (تغییر قیمت، تخفیف، موجودی، کمپین) ندهید — این کار فقط سیستم‌های تحلیلی جداگانه مالک انجام می‌دهند.
خروجی باید فقط ۲ تا ۴ جمله متن ساده فارسی باشد، بدون Markdown و بدون JSON.`;

@Injectable()
export class OwnerAiSummaryService {
  private readonly logger = new Logger(OwnerAiSummaryService.name);

  constructor(
    private settings: SettingsService,
    private aiUsage: OwnerReportAiUsageService,
  ) {}

  async isEnabled(): Promise<boolean> {
    const raw = await this.settings.resolve('ownerReportAiSummaryEnabled');
    return raw !== 'false';
  }

  async summarize(reportData: Record<string, unknown>): Promise<string> {
    if (!(await this.isEnabled())) {
      throw new BadRequestException('خلاصه هوشمند گزارش مالک غیرفعال است.');
    }
    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) throw new BadRequestException('برای این قابلیت باید کلید API هوش مصنوعی در بخش تنظیمات وارد شود.');
    if (!(await this.aiUsage.checkBudget())) throw new BadRequestException('بودجه ماهانه هوش مصنوعی گزارش مالک برای این ماه به پایان رسیده است.');

    let summary: string;
    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `داده‌های واقعی گزارش:\n${JSON.stringify(reportData)}` }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error('پاسخ خالی از دستیار هوشمند');
      summary = text.trim();
    } catch (err) {
      await this.aiUsage.record(false, APPROXIMATE_COST_TOMAN);
      this.logger.error('Owner report AI summary generation failed', err as Error);
      throw new BadRequestException('تولید خلاصه هوشمند گزارش ناموفق بود. لطفاً دوباره تلاش کنید — گزارش عددی همچنان در دسترس است.');
    }
    await this.aiUsage.record(true, APPROXIMATE_COST_TOMAN);
    return summary;
  }
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import AdminHelp from "@/components/admin/AdminHelp";

interface SettingStatus {
  configured: boolean;
  source: "dashboard" | "env" | null;
  preview: string | null;
}

type SettingsResponse = Record<
  | "zarinpalMerchantId"
  | "idpayApiKey"
  | "smsApiKey"
  | "kavenegarOtpTemplate"
  | "melipayamakApiKey"
  | "melipayamakSender"
  | "anthropicApiKey"
  | "anthropicModel"
  | "openaiApiKey"
  | "siteUrl"
  | "imageSearchProvider"
  | "imageSearchApiKey"
  | "removeBgApiKey"
  | "imageGenerationProvider"
  | "imageAutopilotMonthlyBudgetToman"
  | "seoAutoFixEnabled"
  | "seoContentMonthlyBudgetToman"
  | "salesAiMonthlyBudgetToman"
  | "newsMonthlyBudgetToman"
  | "storeAiEnabled"
  | "storeAiMaxResults"
  | "storeAiMonthlyBudgetToman"
  | "storeAiRateLimitPerMinute"
  | "storeAiAllowAddToCart"
  | "storeAiStrictCatalogOnly"
  | "electricalConsultantEnabled"
  | "aiAutonomousMode"
  | "ownerReportAiSummaryEnabled"
  | "ownerReportAiMonthlyBudgetToman"
  | "site3dEnabled",
  SettingStatus
>;

const SOURCE_LABEL: Record<string, string> = {
  dashboard: "از داشبورد",
  env: "از فایل .env سرور",
};

function StatusBadge({ status }: { status: SettingStatus }) {
  if (!status.configured) {
    return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-foreground/50">تنظیم نشده</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="rounded-full bg-brand/10 px-2 py-0.5 font-mono text-brand">{status.preview}</span>
      <span className="text-foreground/40">({SOURCE_LABEL[status.source ?? ""] ?? status.source})</span>
    </span>
  );
}

function SettingField({
  fieldKey,
  label,
  helpText,
  status,
  onSave,
}: {
  fieldKey: string;
  label: string;
  helpText?: string;
  status: SettingStatus;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(fieldKey, value);
      setValue("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-color p-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-bold">{label}</label>
        <StatusBadge status={status} />
      </div>
      {helpText && <p className="mt-1 text-xs text-foreground/50">{helpText}</p>}
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="مقدار جدید را وارد کنید"
          className="flex-1 rounded-lg border border-border-color bg-background px-2 py-1.5 text-sm"
          dir="ltr"
        />
        <button
          onClick={handleSave}
          disabled={saving || !value}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-[#0b0e14] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ذخیره
        </button>
        {status.configured && status.source === "dashboard" && (
          <button
            onClick={() => onSave(fieldKey, "")}
            disabled={saving}
            className="rounded-lg border border-border-color px-3 py-1.5 text-sm text-red-400"
          >
            پاک کردن
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [forbidden, setForbidden] = useState(false);

  function load() {
    if (!accessToken) return;
    api
      .get<SettingsResponse>("/settings", accessToken)
      .then(setSettings)
      .catch(() => setForbidden(true));
  }

  useEffect(load, [accessToken]);

  async function handleSave(key: string, value: string) {
    try {
      const updated = await api.patch<SettingsResponse>("/settings", { [key]: value }, accessToken);
      setSettings(updated);
      toast(value ? "تنظیمات ذخیره شد." : "مقدار پاک شد و به env سرور برگشت.", "success");
    } catch {
      toast("ذخیره تنظیمات با خطا مواجه شد.", "error");
    }
  }

  if (user && user.role !== "SUPER_ADMIN") {
    return <p className="text-sm text-foreground/60">این بخش فقط برای مدیر ارشد در دسترس است.</p>;
  }

  if (forbidden) {
    return <p className="text-sm text-foreground/60">این بخش فقط برای مدیر ارشد در دسترس است.</p>;
  }

  if (!settings) {
    return <p className="text-sm text-foreground/50">در حال بارگذاری...</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">تنظیمات و کلیدهای API</h1>

      <AdminHelp storageKey="settings">
        <p>این بخش برای وصل کردن سرویس‌های خارجی به سایت است: درگاه پرداخت، پیامک، دستیار هوشمند و جستجوی صوتی. تا زمانی که هر کدام را تنظیم نکنید، همان بخش در حالت آزمایشی/محدود کار می‌کند (مثلاً پرداخت واقعی انجام نمی‌شود یا پیامک واقعی ارسال نمی‌شود).</p>
        <p>برای هر مقدار، فقط کلید/کد مربوطه را از پنل همان سرویس (مثلاً پنل زرین‌پال یا ملی‌پیامک) کپی کرده و در کادر بچسبانید، سپس «ذخیره» را بزنید. مقدار قبلی هرگز به‌طور کامل نمایش داده نمی‌شود (فقط چند رقم آخر) تا امنیت حفظ شود.</p>
        <p>این مقادیر مستقیماً در پایگاه‌داده ذخیره می‌شوند؛ نیازی به دسترسی به سرور یا ویرایش فایل نیست. اگر یک مقدار را با دکمه‌ی «پاک کردن» حذف کنید، همان بخش به تنظیمات سرور (env) برمی‌گردد.</p>
        <p>این بخش فقط برای مدیر ارشد قابل مشاهده است، چون مقادیر آن حساس هستند.</p>
      </AdminHelp>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-lg font-bold">درگاه پرداخت زرین‌پال</h2>
          <SettingField
            fieldKey="zarinpalMerchantId"
            label="Merchant ID"
            helpText="تا وقتی این مقدار تنظیم نشده، پرداخت‌ها در حالت sandbox (شبیه‌سازی‌شده) انجام می‌شوند."
            status={settings.zarinpalMerchantId}
            onSave={handleSave}
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">درگاه پرداخت آی‌دی‌پی</h2>
          <SettingField
            fieldKey="idpayApiKey"
            label="API Key"
            helpText="تا وقتی این مقدار تنظیم نشده، پرداخت‌ها در حالت sandbox (شبیه‌سازی‌شده) انجام می‌شوند."
            status={settings.idpayApiKey}
            onSave={handleSave}
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">پیامک (ملی‌پیامک)</h2>
          <div className="space-y-3">
            <SettingField
              fieldKey="melipayamakApiKey"
              label="API Key"
              helpText="از کنسول ملی‌پیامک (وب‌سرویس > REST API) — اگر این و شماره خط پر شوند، پیامک از طریق ملی‌پیامک ارسال می‌شود."
              status={settings.melipayamakApiKey}
              onSave={handleSave}
            />
            <SettingField
              fieldKey="melipayamakSender"
              label="شماره خط ارسالی"
              helpText="همان شماره خطی که در پنل ملی‌پیامک برای ارسال تخصیص داده شده."
              status={settings.melipayamakSender}
              onSave={handleSave}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">پیامک (کاوه‌نگار — جایگزین)</h2>
          <p className="mb-3 text-xs text-foreground/50">
            فقط وقتی استفاده می‌شود که ملی‌پیامک بالا تنظیم نشده باشد.
          </p>
          <div className="space-y-3">
            <SettingField
              fieldKey="smsApiKey"
              label="API Key"
              helpText="تا وقتی هیچ‌کدام از این دو تنظیم نشده، کد تایید OTP فقط در لاگ سرور نمایش داده می‌شود."
              status={settings.smsApiKey}
              onSave={handleSave}
            />
            <SettingField
              fieldKey="kavenegarOtpTemplate"
              label="نام قالب Verify Lookup"
              helpText="باید از قبل در پنل کاوه‌نگار (Message > Verify Lookup) ثبت و تایید شده باشد."
              status={settings.kavenegarOtpTemplate}
              onSave={handleSave}
            />
          </div>
        </section>

        {/* ─────────────────── همه‌ی تنظیمات هوش مصنوعی، یک‌جا ─────────────────── */}
        <details open className="rounded-xl border-2 border-brand/30 bg-brand/[0.03] p-4">
          <summary className="cursor-pointer text-xl font-bold text-brand">🤖 هوش مصنوعی (AI) — همه تنظیمات</summary>
          <p className="my-3 text-xs text-foreground/60">
            فقط با وارد کردن یک «کلید اصلی Anthropic» زیر، تقریباً همه‌ی قابلیت‌های هوش مصنوعی فروشگاه (مشاور فروش، آماده‌سازی محصول، سئوی خودکار، تولید محتوا، اخبار برق، خلاصه گزارش روزانه) فعال می‌شوند.
            بقیه‌ی بخش‌های این‌جا (تصویر خودکار، بودجه‌ها، تنظیمات دقیق‌تر هر بخش) کاملاً اختیاری‌اند — می‌توانید بازشان نکنید.
          </p>

          <div className="space-y-3">
            <details open className="rounded-lg border border-border-color p-3">
              <summary className="cursor-pointer font-bold">کلید اصلی (Anthropic) — همین یکی مهم‌ترینه</summary>
              <div className="mt-3 space-y-3">
                <SettingField
                  fieldKey="anthropicApiKey"
                  label="API Key"
                  helpText="تا وقتی تنظیم نشده، مشاور هوشمند با پاسخ‌های ساده مبتنی بر قوانین کار می‌کند."
                  status={settings.anthropicApiKey}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="anthropicModel"
                  label="مدل (اختیاری)"
                  helpText="پیش‌فرض: claude-sonnet-4-5"
                  status={settings.anthropicModel}
                  onSave={handleSave}
                />
              </div>
            </details>

            <details className="rounded-lg border border-border-color p-3">
              <summary className="cursor-pointer font-bold">دستیار فروش هوشمند فروشگاه (Store-only AI)</summary>
              <p className="mt-2 mb-3 text-xs text-foreground/50">
                این دستیار فقط و فقط از کاتالوگ واقعی سلطان نور محصول پیشنهاد می‌دهد و هرگز محصولی از فروشگاه دیگری معرفی نمی‌کند. «فقط کاتالوگ» پیش‌فرض همیشه فعال است.
              </p>
              <div className="space-y-3">
                <SettingField
                  fieldKey="storeAiEnabled"
                  label="فعال بودن دستیار فروش (مقدار «false» برای غیرفعال کردن)"
                  helpText="اگر خالی باشد یا هر مقداری غیر از «false» باشد، دستیار فعال است."
                  status={settings.storeAiEnabled}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="storeAiStrictCatalogOnly"
                  label="فقط کاتالوگ واقعی — بدون استدلال آزاد AI (مقدار «false» برای اجازه‌ی استدلال AI در مقایسه‌ها)"
                  helpText="پیش‌فرض تولید همیشه فعال (روشن) است."
                  status={settings.storeAiStrictCatalogOnly}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="storeAiMaxResults"
                  label="حداکثر تعداد محصول پیشنهادی در هر پاسخ"
                  helpText="پیش‌فرض: ۵"
                  status={settings.storeAiMaxResults}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="storeAiRateLimitPerMinute"
                  label="حداکثر تعداد درخواست مجاز در دقیقه (برای هر کاربر/IP)"
                  helpText="پیش‌فرض: ۱۰"
                  status={settings.storeAiRateLimitPerMinute}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="storeAiAllowAddToCart"
                  label="نمایش دکمه «افزودن به سبد» در چت (مقدار «false» برای مخفی کردن)"
                  helpText="افزودن واقعی همیشه از طریق API واقعی سبد خرید و با بررسی مجدد موجودی/قیمت انجام می‌شود."
                  status={settings.storeAiAllowAddToCart}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="storeAiMonthlyBudgetToman"
                  label="سقف هزینه‌ی ماهانه استدلال AI (تومان، تخمینی)"
                  helpText="اگر خالی باشد، محدودیتی اعمال نمی‌شود."
                  status={settings.storeAiMonthlyBudgetToman}
                  onSave={handleSave}
                />
              </div>
            </details>

            <details className="rounded-lg border border-border-color p-3">
              <summary className="cursor-pointer font-bold">گزارش هوشمند مالک (خلاصه گزارش روزانه)</summary>
              <div className="mt-3 space-y-3">
                <SettingField
                  fieldKey="ownerReportAiSummaryEnabled"
                  label="فعال بودن خلاصه هوشمند گزارش روزانه (مقدار «false» برای غیرفعال کردن)"
                  helpText="این فقط اعداد واقعی محاسبه‌شده توسط بک‌اند را به فارسی ساده توضیح می‌دهد — خودش هیچ عددی نمی‌سازد."
                  status={settings.ownerReportAiSummaryEnabled}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="ownerReportAiMonthlyBudgetToman"
                  label="سقف هزینه‌ی ماهانه خلاصه هوشمند گزارش (تومان، تخمینی)"
                  helpText="اگر خالی باشد، محدودیتی اعمال نمی‌شود."
                  status={settings.ownerReportAiMonthlyBudgetToman}
                  onSave={handleSave}
                />
              </div>
            </details>

            <details className="rounded-lg border border-border-color p-3">
              <summary className="cursor-pointer font-bold">اخبار برق (News Autopilot)</summary>
              <div className="mt-3">
                <SettingField
                  fieldKey="newsMonthlyBudgetToman"
                  label="سقف هزینه‌ی ماهانه تولید خبر با AI (تومان، تخمینی)"
                  helpText="اگر خالی باشد، محدودیتی اعمال نمی‌شود."
                  status={settings.newsMonthlyBudgetToman}
                  onSave={handleSave}
                />
              </div>
            </details>

            <details className="rounded-lg border border-border-color p-3">
              <summary className="cursor-pointer font-bold">حالت خودمختار (Autonomous Mode) — پیش‌فرض خاموش</summary>
              <p className="mt-2 mb-3 text-xs text-foreground/50">
                برخلاف بقیه‌ی تنظیمات این صفحه، این یکی فقط با مقدار دقیق «true» روشن می‌شود. حتی وقتی روشن باشد، تغییر قیمت، تخفیف، انتشار محصول/خبر/محتوا، فعال‌سازی کمپین، تغییر موجودی، ثبت سفارش خرید و هرگونه پیام تبلیغاتی همیشه نیازمند تأیید دستی مالک است.
              </p>
              <SettingField
                fieldKey="aiAutonomousMode"
                label="فعال بودن حالت خودمختار (فقط مقدار «true» آن را روشن می‌کند)"
                helpText="فعلاً تنها اثر این حالت، اجازه‌دادن به اصلاح خودکار کم‌ریسک سئو است — آن هم فقط وقتی «seoAutoFixEnabled» هم روشن باشد."
                status={settings.aiAutonomousMode}
                onSave={handleSave}
              />
            </details>

            <details className="rounded-lg border border-border-color p-3">
              <summary className="cursor-pointer font-bold">تصویر خودکار محصول (Image Autopilot) — اختیاری</summary>
              <p className="mt-2 mb-3 text-xs text-foreground/50">
                هر کلید زیر اختیاری‌ست. تا وقتی تنظیم نشوند، آماده‌سازی محصول با AI بدون خطا ادامه پیدا می‌کند — فقط باید عکس را دستی بارگذاری کنید. تولید تصویر با AI از همان کلید OpenAI زیر استفاده می‌کند.
              </p>
              <div className="space-y-3">
                <SettingField
                  fieldKey="openaiApiKey"
                  label="کلید OpenAI (برای جستجوی صوتی و تولید عکس با AI)"
                  helpText="تا وقتی تنظیم نشده، جستجوی صوتی و تولید عکس با AI غیرفعال است."
                  status={settings.openaiApiKey}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="imageSearchApiKey"
                  label="کلید جستجوی تصویر (Bing Image Search)"
                  helpText="برای جستجوی خودکار عکس واقعی محصول در اینترنت. اگر خالی باشد، این مرحله رد می‌شود."
                  status={settings.imageSearchApiKey}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="removeBgApiKey"
                  label="کلید حذف پس‌زمینه (remove.bg)"
                  helpText="اختیاری — اگر تنظیم نشود، عکس با پس‌زمینه‌ی اصلی خودش استفاده می‌شود."
                  status={settings.removeBgApiKey}
                  onSave={handleSave}
                />
                <SettingField
                  fieldKey="imageAutopilotMonthlyBudgetToman"
                  label="سقف هزینه‌ی ماهانه (تومان، تخمینی)"
                  helpText="اگر خالی باشد، محدودیتی اعمال نمی‌شود."
                  status={settings.imageAutopilotMonthlyBudgetToman}
                  onSave={handleSave}
                />
              </div>
            </details>
          </div>
        </details>

        <section>
          <h2 className="mb-3 text-lg font-bold">مشاور هوشمند برق ساختمان</h2>
          <p className="mb-3 text-xs text-foreground/50">این مشاور رول‌بیس است، هیچ تماسی با هوش مصنوعی/AI ندارد — برای همین جدا از بخش بالاست.</p>
          <SettingField
            fieldKey="electricalConsultantEnabled"
            label="فعال بودن مشاور هوشمند برق (مقدار «false» برای غیرفعال کردن)"
            helpText="کاملاً بر پایه‌ی محاسبات قطعی و کاتالوگ واقعی سلطان نور کار می‌کند. قوانین محاسبه از صفحه «قوانین مشاور هوشمند برق» تنظیم می‌شوند."
            status={settings.electricalConsultantEnabled}
            onSave={handleSave}
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">عمومی</h2>
          <SettingField
            fieldKey="siteUrl"
            label="آدرس سایت (برای بازگشت از درگاه پرداخت)"
            helpText="مثال: https://sultannoor.ir — بدون / در انتها"
            status={settings.siteUrl}
            onSave={handleSave}
          />
          <SettingField
            fieldKey="site3dEnabled"
            label="نمایشگر خانه هوشمند صفحه اصلی"
            helpText="مقدار «false» را وارد کنید تا نمایشگر خانه هوشمند خاموش شود و این بخش از صفحه اصلی نمایش داده نشود؛ خالی یا هر مقدار دیگر یعنی روشن."
            status={settings.site3dEnabled}
            onSave={handleSave}
          />
        </section>
      </div>
    </div>
  );
}

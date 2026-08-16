"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

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
  | "siteUrl",
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
      <h1 className="mb-2 text-2xl font-bold">تنظیمات و کلیدهای API</h1>
      <p className="mb-6 text-sm text-foreground/60">
        این مقادیر مستقیماً در پایگاه‌داده ذخیره می‌شوند و نیازی به دسترسی سرور یا ویرایش فایل .env ندارند. مقادیر قبلی هرگز
        نمایش داده نمی‌شوند — فقط چند رقم آخر آن‌ها.
      </p>

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

        <section>
          <h2 className="mb-3 text-lg font-bold">مشاور هوشمند (Anthropic)</h2>
          <div className="space-y-3">
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
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">جستجوی صوتی (OpenAI Whisper)</h2>
          <SettingField
            fieldKey="openaiApiKey"
            label="API Key"
            helpText="تا وقتی تنظیم نشده، جستجوی صوتی غیرفعال است."
            status={settings.openaiApiKey}
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
        </section>
      </div>
    </div>
  );
}

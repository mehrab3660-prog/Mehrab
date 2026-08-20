"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { AdminQuestion } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

export default function AdminQaPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [onlyUnanswered, setOnlyUnanswered] = useState(true);
  const [suggesting, setSuggesting] = useState<Record<string, boolean>>({});

  function load() {
    if (!accessToken) return;
    api.get<AdminQuestion[]>("/qa/questions/admin", accessToken).then(setQuestions);
  }

  useEffect(load, [accessToken]);

  async function handleAnswer(questionId: string) {
    const body = answerDrafts[questionId]?.trim();
    if (!body) return;
    try {
      await api.post(`/qa/questions/${questionId}/answers`, { body }, accessToken);
      setAnswerDrafts((prev) => ({ ...prev, [questionId]: "" }));
      toast("پاسخ ثبت شد.", "success");
      load();
    } catch {
      toast("ثبت پاسخ با خطا مواجه شد.", "error");
    }
  }

  async function handleSuggest(questionId: string) {
    setSuggesting((prev) => ({ ...prev, [questionId]: true }));
    try {
      const result = await api.post<{ suggestion: string | null; reason?: string }>(
        `/qa/questions/${questionId}/suggest-answer`,
        undefined,
        accessToken,
      );
      if (result.suggestion) {
        setAnswerDrafts((prev) => ({ ...prev, [questionId]: result.suggestion as string }));
        toast("پیش‌نویس آماده شد — قبل از ارسال بررسی کنید.", "success");
      } else {
        toast(result.reason ?? "پیشنهادی ساخته نشد.", "error");
      }
    } catch {
      toast("درخواست پیش‌نویس با خطا مواجه شد.", "error");
    } finally {
      setSuggesting((prev) => ({ ...prev, [questionId]: false }));
    }
  }

  const visible = questions?.filter((q) => !onlyUnanswered || !q.isAnswered) ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">پرسش و پاسخ محصولات</h1>
        <label className="flex items-center gap-1.5 text-sm text-foreground/70">
          <input type="checkbox" checked={onlyUnanswered} onChange={(e) => setOnlyUnanswered(e.target.checked)} />
          فقط پاسخ‌داده‌نشده‌ها
        </label>
      </div>

      <AdminHelp storageKey="qa">
        <p>مشتریان می‌توانند از صفحه‌ی هر محصول سوال بپرسند. سوال‌های بدون پاسخ اینجا با برچسب زرد «پاسخ‌داده‌نشده» مشخص می‌شوند.</p>
        <p>برای پاسخ دادن، متن خود را در کادر وارد کنید و «ارسال پاسخ» را بزنید؛ پاسخ شما با برچسب «فروشگاه» زیر همان سوال نمایش داده می‌شود و همه‌ی بازدیدکنندگان آن را می‌بینند.</p>
        <p>می‌توانید روی «پیش‌نویس با هوش مصنوعی» بزنید تا بر اساس اطلاعات واقعی همان محصول یک پیش‌نویس پاسخ در کادر نوشته شود — حتماً قبل از ارسال آن را بخوانید و در صورت نیاز ویرایش کنید؛ این یک پیشنهاد است، نه پاسخ نهایی. اگر کلید API هوش مصنوعی در «تنظیمات» وارد نشده باشد، این دکمه کار نمی‌کند.</p>
        <p>با تیک «فقط پاسخ‌داده‌نشده‌ها» می‌توانید فقط سوال‌هایی را ببینید که هنوز پاسخی نگرفته‌اند.</p>
      </AdminHelp>

      {questions === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-foreground/50">پرسشی برای نمایش وجود ندارد.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((q) => (
            <div key={q.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="flex items-center justify-between">
                <Link href={`/products/${q.product.slug}`} target="_blank" className="font-bold text-brand hover:underline">
                  {q.product.name}
                </Link>
                {!q.isAnswered && <span className="rounded bg-brand/10 px-2 py-0.5 text-xs text-brand">پاسخ‌داده‌نشده</span>}
              </div>
              <p className="mt-1">{q.body}</p>
              <p className="mt-1 text-xs text-foreground/40">
                {q.user.fullName ?? "کاربر"} — {q.user.phone}
              </p>
              {q.answers.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-border-color pt-2">
                  {q.answers.map((a) => (
                    <p key={a.id} className="text-foreground/70">
                      {a.isFromStaff && <span className="ml-1 rounded bg-brand/10 px-1 text-xs text-brand">فروشگاه</span>}
                      {a.body}
                    </p>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  value={answerDrafts[q.id] ?? ""}
                  onChange={(e) => setAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="پاسخ شما... (یا از «پیش‌نویس با هوش مصنوعی» استفاده کنید)"
                  className="flex-1 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <button
                  onClick={() => handleSuggest(q.id)}
                  disabled={suggesting[q.id]}
                  className="rounded-lg border border-border-color px-3 py-1 text-xs text-foreground/70 hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  {suggesting[q.id] ? "..." : "پیش‌نویس با هوش مصنوعی"}
                </button>
                <button onClick={() => handleAnswer(q.id)} className="rounded-lg bg-brand px-3 py-1 text-xs text-[#0b0e14]">
                  ارسال پاسخ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

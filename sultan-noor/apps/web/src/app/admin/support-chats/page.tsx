"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { AiConversation } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  USER: "مشتری",
  ASSISTANT: "دستیار هوشمند",
  STAFF: "پشتیبان",
  SYSTEM: "",
};

export default function AdminSupportChatsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<AiConversation[] | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});

  function load() {
    if (!accessToken) return;
    api.get<AiConversation[]>("/ai-advisor/staff/escalated", accessToken).then(setConversations);
  }

  useEffect(load, [accessToken]);

  // Escalations can arrive at any time — a light poll keeps the queue
  // current without staff needing to manually refresh the page.
  useEffect(() => {
    if (!accessToken) return;
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function sendReply(conversationId: string) {
    const message = replies[conversationId]?.trim();
    if (!message) return;
    setSending({ ...sending, [conversationId]: true });
    try {
      await api.post(`/ai-advisor/${conversationId}/reply`, { message }, accessToken);
      setReplies({ ...replies, [conversationId]: "" });
      load();
    } catch {
      toast("ارسال پاسخ با خطا مواجه شد.", "error");
    } finally {
      setSending({ ...sending, [conversationId]: false });
    }
  }

  async function resolve(conversationId: string) {
    try {
      await api.patch(`/ai-advisor/${conversationId}/resolve`, undefined, accessToken);
      toast("گفتگو حل‌شده علامت‌گذاری شد.", "success");
      load();
    } catch {
      toast("عملیات با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">گفتگوهای پشتیبانی زنده</h1>

      {conversations === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-foreground/50">در حال حاضر درخواست پشتیبانی در انتظاری وجود ندارد.</p>
      ) : (
        <div className="space-y-4">
          {conversations.map((conv) => (
            <div key={conv.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{conv.user ? (conv.user.fullName ?? conv.user.phone) : "مهمان (بدون حساب کاربری)"}</span>
                <button onClick={() => resolve(conv.id)} className="rounded-lg border border-border-color px-3 py-1 text-xs hover:border-brand hover:text-brand">
                  علامت‌گذاری به‌عنوان حل‌شده
                </button>
              </div>

              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-background p-2">
                {conv.messages.map((m) =>
                  m.role === "SYSTEM" ? (
                    <p key={m.id} className="text-center text-xs text-foreground/40">
                      {m.content}
                    </p>
                  ) : (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs ${
                        m.role === "USER" ? "mr-auto bg-surface-2" : m.role === "STAFF" ? "ml-auto bg-brand/20" : "ml-auto bg-surface-2 text-foreground/60"
                      }`}
                    >
                      <p className="mb-0.5 font-bold text-foreground/40">{ROLE_LABEL[m.role]}</p>
                      {m.content}
                    </div>
                  ),
                )}
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  value={replies[conv.id] ?? ""}
                  onChange={(e) => setReplies({ ...replies, [conv.id]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && sendReply(conv.id)}
                  placeholder="پاسخ خود را بنویسید..."
                  className="flex-1 rounded-lg border border-border-color bg-background px-2 py-1 text-xs"
                />
                <button
                  onClick={() => sendReply(conv.id)}
                  disabled={sending[conv.id]}
                  className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-[#0b0e14] disabled:opacity-50"
                >
                  ارسال
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

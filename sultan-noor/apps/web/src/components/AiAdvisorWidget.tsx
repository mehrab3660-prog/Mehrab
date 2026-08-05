"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function AiAdvisorWidget() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "سلام! من دستیار خرید سلطان نور هستم. چه محصولی می‌خواهید پیدا کنید؟" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.post<{ conversationId: string; reply: string }>("/ai-advisor/ask", {
        conversationId,
        message: userMessage,
      });
      setConversationId(res.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "خطایی رخ داد، لطفاً دوباره تلاش کنید." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {open && (
        <div className="mb-3 flex h-96 w-80 flex-col rounded-xl border border-border-color bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border-color p-3">
            <span className="text-sm font-bold">مشاور خرید هوشمند</span>
            <button onClick={() => setOpen(false)} className="text-foreground/50">
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 ${
                  m.role === "user" ? "mr-auto bg-brand text-white" : "ml-auto bg-background"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && <div className="ml-auto text-xs text-foreground/50">در حال فکر کردن...</div>}
          </div>
          <div className="flex gap-2 border-t border-border-color p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="مثلاً: لامپ کم‌مصرف برای اتاق خواب"
              className="flex-1 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
            />
            <button onClick={send} className="rounded-lg bg-brand px-3 py-1 text-sm text-white">
              ارسال
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-white shadow-lg"
        aria-label="مشاور خرید هوشمند"
      >
        🤖
      </button>
    </div>
  );
}

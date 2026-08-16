"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="mb-3 flex h-96 w-80 flex-col overflow-hidden rounded-2xl border border-border-color bg-surface shadow-2xl shadow-black/10"
          >
            <div className="flex items-center justify-between border-b border-border-color bg-surface-2 p-3">
              <span className="text-sm font-bold">مشاور خرید هوشمند</span>
              <button onClick={() => setOpen(false)} className="text-foreground/50 transition hover:text-foreground">
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`max-w-[85%] rounded-xl px-3 py-2 ${
                      m.role === "user" ? "mr-auto bg-brand text-white" : "ml-auto bg-surface-2"
                    }`}
                  >
                    {m.content}
                  </motion.div>
                ))}
              </AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="ml-auto flex items-center gap-1 text-xs text-foreground/50"
                >
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-foreground/40"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </span>
                  در حال فکر کردن
                </motion.div>
              )}
            </div>
            <div className="flex gap-2 border-t border-border-color p-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="مثلاً: لامپ کم‌مصرف برای اتاق خواب"
                className="flex-1 rounded-lg border border-border-color bg-background px-2 py-1 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={send}
                className="rounded-lg bg-brand px-3 py-1 text-sm text-white transition-colors hover:bg-brand-dark"
              >
                ارسال
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        animate={open ? {} : { boxShadow: ["0 0 0 0 rgba(200,134,11,0.4)", "0 0 0 14px rgba(200,134,11,0)"] }}
        transition={open ? {} : { duration: 2, repeat: Infinity, ease: "easeOut" }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-light to-brand text-2xl text-white shadow-lg"
        aria-label="مشاور خرید هوشمند"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.25 }}>
          {open ? "✕" : "🤖"}
        </motion.span>
      </motion.button>
    </div>
  );
}

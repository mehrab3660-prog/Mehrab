"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useAiAdvisor } from "@/context/AiAdvisorContext";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { useBottomNavVisible } from "@/lib/useBottomNav";
import { AiAskResponse, AiConversation, AiProductCard } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant" | "system" | "staff";
  content: string;
  suggestedProducts?: AiProductCard[];
  relatedProducts?: AiProductCard[];
  allowAddToCart?: boolean;
}

const GREETING: ChatMessage = { role: "assistant", content: "سلام! من دستیار خرید سلطان نور هستم. چه محصولی می‌خواهید پیدا کنید؟" };

function formatToman(value: number) {
  return `${value.toLocaleString("fa-IR")} تومان`;
}

// The only products the chat ever renders — always the real, hydrated
// Product Cards the backend returned, never anything parsed out of the AI's
// free-text reply (Sprint 6: Store-only AI Product Seller).
function MiniProductCard({ product, allowAddToCart }: { product: AiProductCard; allowAddToCart?: boolean }) {
  const { user } = useAuth();
  const { addItem } = useCart();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!user) {
      toast("برای افزودن به سبد خرید ابتدا وارد شوید.", "info");
      return;
    }
    setAdding(true);
    try {
      await addItem(product.id, 1, undefined, "ai_advisor");
      toast("به سبد خرید اضافه شد.", "success");
    } catch {
      toast("افزودن به سبد خرید با خطا مواجه شد.", "error");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex gap-2 rounded-lg border border-border-color bg-background p-2">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt={product.name} className="h-14 w-14 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[10px] text-foreground/40">
          بدون تصویر
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-xs font-bold">{product.name}</p>
        {product.brand && <p className="text-[10px] text-foreground/50">{product.brand}</p>}
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-xs font-bold text-brand">{formatToman(product.price)}</span>
          {!product.inStock && <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] text-foreground/50">ناموجود</span>}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <Link href={`/products/${product.slug}`} className="rounded-md border border-border-color px-2 py-1 text-[10px] hover:border-brand">
            مشاهده محصول
          </Link>
          {allowAddToCart && product.inStock && (
            <button
              onClick={handleAdd}
              disabled={adding}
              className="rounded-md bg-brand px-2 py-1 text-[10px] font-bold text-[#0b0e14] disabled:opacity-50"
            >
              {adding ? "..." : "افزودن به سبد"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function mapServerRole(role: string): ChatMessage["role"] {
  if (role === "USER") return "user";
  if (role === "STAFF") return "staff";
  if (role === "SYSTEM") return "system";
  return "assistant";
}

export default function AiAdvisorWidget() {
  const { open, setOpen, prefill, consumePrefill } = useAiAdvisor();
  const pathname = usePathname();
  const bottomNavVisible = useBottomNavVisible();
  // Checkout has its own sticky, full-width pay CTA at the very bottom on
  // mobile — the floating button needs extra clearance there so nothing
  // fixed ever sits on top of the payment action.
  const fabOffset = pathname.startsWith("/checkout")
    ? "bottom-24"
    : bottomNavVisible
      ? "bottom-20 sm:bottom-4"
      : "bottom-4";
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [escalating, setEscalating] = useState(false);

  useEffect(() => {
    if (prefill) setInput(prefill);
  }, [prefill]);

  // Once a human has been asked to join, poll for their replies (and for
  // the conversation being marked resolved) while the widget is open.
  useEffect(() => {
    if (!open || !conversationId || !escalated || resolved) return;
    const timer = setInterval(async () => {
      try {
        const conv = await api.get<AiConversation>(`/ai-advisor/${conversationId}`);
        setMessages(conv.messages.map((m) => ({ role: mapServerRole(m.role), content: m.content })));
        if (conv.resolvedAt) setResolved(true);
      } catch {
        // transient network hiccup — the next tick will retry
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [open, conversationId, escalated, resolved]);

  async function send(overrideMessage?: string) {
    const text = (overrideMessage ?? input).trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    consumePrefill();
    setLoading(true);
    try {
      const res = await api.post<AiAskResponse>("/ai-advisor/ask", {
        conversationId,
        message: text,
      });
      setConversationId(res.conversationId);
      if (res.reply) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.reply as string,
            suggestedProducts: res.suggestedProducts,
            relatedProducts: res.relatedProducts,
            allowAddToCart: res.allowAddToCart,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "خطایی رخ داد، لطفاً دوباره تلاش کنید." }]);
    } finally {
      setLoading(false);
    }
  }

  async function requestHuman() {
    if (!conversationId || (escalated && !resolved)) return;
    setEscalating(true);
    try {
      await api.post(`/ai-advisor/${conversationId}/escalate`);
      setEscalated(true);
      setResolved(false);
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "درخواست شما برای صحبت با پشتیبان انسانی ثبت شد؛ لطفاً کمی صبر کنید." },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "system", content: "ثبت درخواست پشتیبان با خطا مواجه شد." }]);
    } finally {
      setEscalating(false);
    }
  }

  return (
    <div className={`fixed left-4 z-40 transition-[bottom] duration-300 ${fabOffset}`}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="mb-3 flex h-96 w-80 flex-col overflow-hidden rounded-2xl border border-border-color bg-surface shadow-2xl shadow-black/40"
          >
            <div className="flex items-center justify-between border-b border-border-color bg-gradient-to-l from-accent-purple/20 to-accent-cyan/10 p-3">
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <span className="text-base">🤖</span> مشاور هوشمند سلطان
              </span>
              <button onClick={() => setOpen(false)} className="text-foreground/50 transition hover:text-foreground">
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
              <AnimatePresence initial={false}>
                {[GREETING, ...messages].map((m, i) =>
                  m.role === "system" ? (
                    <motion.p
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-xs text-foreground/40"
                    >
                      {m.content}
                    </motion.p>
                  ) : (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`${(m.suggestedProducts?.length || m.relatedProducts?.length) ? "w-[92%]" : "max-w-[85%]"} rounded-xl px-3 py-2 ${
                        m.role === "user"
                          ? "mr-auto bg-brand text-[#0b0e14]"
                          : m.role === "staff"
                            ? "ml-auto bg-accent-cyan/20"
                            : "ml-auto bg-surface-2"
                      }`}
                    >
                      {m.role === "staff" && <p className="mb-0.5 text-xs font-bold text-accent-cyan">پشتیبان</p>}
                      {m.content}
                      {!!m.suggestedProducts?.length && (
                        <div className="mt-2 space-y-1.5">
                          {m.suggestedProducts.map((p) => (
                            <MiniProductCard key={p.id} product={p} allowAddToCart={m.allowAddToCart} />
                          ))}
                        </div>
                      )}
                      {!!m.relatedProducts?.length && (
                        <div className="mt-2">
                          <p className="mb-1 text-[10px] text-foreground/50">محصولات مرتبط:</p>
                          <div className="space-y-1.5">
                            {m.relatedProducts.map((p) => (
                              <MiniProductCard key={p.id} product={p} allowAddToCart={m.allowAddToCart} />
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ),
                )}
              </AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="ml-auto flex items-center gap-1 text-xs text-muted"
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
            {conversationId && (!escalated || resolved) && (
              <div className="border-t border-border-color px-2 pt-2">
                <button
                  onClick={requestHuman}
                  disabled={escalating}
                  className="w-full rounded-lg border border-accent-cyan/40 py-1 text-xs font-medium text-accent-cyan disabled:opacity-50"
                >
                  {escalating ? "در حال ارسال..." : "صحبت با پشتیبان انسانی"}
                </button>
              </div>
            )}
            {escalated && !resolved && (
              <p className="border-t border-border-color px-3 pt-2 text-center text-xs text-accent-cyan">
                در انتظار پاسخ پشتیبان...
              </p>
            )}
            <div className="flex gap-2 border-t border-border-color p-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="مثلاً: لامپ کم‌مصرف برای اتاق خواب"
                className="flex-1 rounded-lg border border-border-color bg-background px-2 py-1 text-sm outline-none focus:border-accent-cyan focus:ring-2 focus:ring-accent-cyan/20"
              />
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => send()}
                className="rounded-lg bg-gradient-to-l from-accent-purple to-accent-cyan px-3 py-1 text-sm font-bold text-white"
              >
                ارسال
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        animate={open ? {} : { boxShadow: ["0 0 0 0 rgba(139,107,240,0.35)", "0 0 0 14px rgba(139,107,240,0)"] }}
        transition={open ? {} : { duration: 2, repeat: Infinity, ease: "easeOut" }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent-cyan text-2xl text-white shadow-lg"
        aria-label="مشاور خرید هوشمند"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.25 }}>
          {open ? "✕" : "🤖"}
        </motion.span>
      </motion.button>
    </div>
  );
}

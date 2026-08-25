"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUp } from "@/lib/motion";

const ICONS: Record<string, React.ReactNode> = {
  shipping: (
    <path d="M3 7h11v9H3V7Zm11 3h4l3 3v3h-7v-6ZM6 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
  ),
  shield: <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Zm-1 11.5 5-5-1.4-1.4L11 12.7l-2.1-2.1L7.5 12l3.5 3.5Z" />,
  support: (
    <path d="M12 3a9 9 0 0 0-9 9v4a3 3 0 0 0 3 3h1v-7H5v-1a7 7 0 0 1 14 0v1h-2v7h1a3 3 0 0 0 3-3v-1a9 9 0 0 0-9-9Z" />
  ),
  refund: (
    <path d="M4 12a8 8 0 1 1 3 6.3M4 12v5M4 12H9" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" />
  ),
};

const ITEMS = [
  { icon: "shield", title: "ضمانت اصالت کالا", desc: "کالای اورجینال با ضمانت" },
  { icon: "shipping", title: "ارسال سریع", desc: "ارسال به سراسر ایران" },
  { icon: "support", title: "پشتیبانی ۲۴/۷", desc: "همیشه همراه شما هستیم" },
  { icon: "refund", title: "ضمانت بازگشت", desc: "۷ روز ضمانت بازگشت" },
];

export default function TrustBadges() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="grid grid-cols-2 gap-4 sm:grid-cols-4"
    >
      {ITEMS.map((item) => (
        <motion.div
          key={item.title}
          variants={fadeUp}
          whileHover={{ y: -4 }}
          className="flex flex-col items-center gap-2 rounded-2xl surface-card p-5 text-center transition-shadow hover:glow-shadow"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              {ICONS[item.icon]}
            </svg>
          </span>
          <span className="text-sm font-bold">{item.title}</span>
          <span className="text-xs text-foreground/50">{item.desc}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

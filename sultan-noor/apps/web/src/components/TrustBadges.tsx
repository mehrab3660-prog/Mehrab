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
  price: <path d="M4 4h8l8 8-8 8-8-8V4Zm4 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />,
};

const ITEMS = [
  { icon: "shipping", title: "ارسال سریع", desc: "به سراسر کشور" },
  { icon: "shield", title: "ضمانت اصالت کالا", desc: "۱۰۰٪ اورجینال" },
  { icon: "support", title: "پشتیبانی ۲۴ ساعته", desc: "همیشه در دسترس" },
  { icon: "price", title: "قیمت عمده ویژه", desc: "برای مشتریان B2B" },
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

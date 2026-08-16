import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { AiAdvisorProvider } from "@/context/AiAdvisorContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AiAdvisorWidget from "@/components/AiAdvisorWidget";
import PageTransition from "@/components/PageTransition";
import MobileBottomNav from "@/components/MobileBottomNav";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "سلطان نور | فروشگاه اینترنتی روشنایی",
  description: "فروشگاه کامل B2C و B2B سلطان نور — محصولات روشنایی، قیمت‌گذاری عمده و مشاور خرید هوشمند.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <AiAdvisorProvider>
                <Header />
                <main className="flex-1 pb-16 sm:pb-0">
                  <PageTransition>{children}</PageTransition>
                </main>
                <Footer />
                <AiAdvisorWidget />
                <MobileBottomNav />
              </AiAdvisorProvider>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

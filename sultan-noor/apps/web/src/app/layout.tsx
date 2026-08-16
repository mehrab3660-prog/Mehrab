import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { AiAdvisorProvider } from "@/context/AiAdvisorContext";
import { ToastProvider } from "@/context/ToastContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AiAdvisorWidget from "@/components/AiAdvisorWidget";
import PageTransition from "@/components/PageTransition";
import MobileBottomNav from "@/components/MobileBottomNav";
import MainContent from "@/components/MainContent";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "سلطان نور | فروشگاه اینترنتی روشنایی",
  description: "فروشگاه سلطان نور — محصولات روشنایی و تجهیزات برق، با مشاور خرید هوشمند.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <ToastProvider>
            <CartProvider>
              <WishlistProvider>
                <AiAdvisorProvider>
                  <Header />
                  <MainContent>
                    <PageTransition>{children}</PageTransition>
                  </MainContent>
                  <Footer />
                  <AiAdvisorWidget />
                  <MobileBottomNav />
                </AiAdvisorProvider>
              </WishlistProvider>
            </CartProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

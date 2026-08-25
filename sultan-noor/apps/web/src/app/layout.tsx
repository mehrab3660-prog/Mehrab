import type { Metadata } from "next";
import { Vazirmatn, Sora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { CompareProvider } from "@/context/CompareContext";
import { AiAdvisorProvider } from "@/context/AiAdvisorContext";
import { ToastProvider } from "@/context/ToastContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AiAdvisorWidget from "@/components/AiAdvisorWidget";
import PageTransition from "@/components/PageTransition";
import MobileBottomNav from "@/components/MobileBottomNav";
import MainContent from "@/components/MainContent";
import SplashIntro from "@/components/SplashIntro";
import { JsonLd, SITE_URL } from "@/lib/jsonld";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
});

// Latin/numeral display font for technical labels and headline accents,
// per the "Architectural Luminescence" design system — Vazirmatn remains
// the font for all Persian body text.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "سلطان نور | فروشگاه اینترنتی روشنایی",
  description: "فروشگاه سلطان نور — محصولات روشنایی و تجهیزات برق، با مشاور خرید هوشمند.",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "سلطان نور",
  url: SITE_URL,
  description: "فروشگاه اینترنتی تخصصی تجهیزات برق و روشنایی، با مشاور خرید هوشمند.",
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "سلطان نور",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/products?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} ${sora.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <JsonLd data={organizationJsonLd} />
        <JsonLd data={websiteJsonLd} />
        <AuthProvider>
          <ToastProvider>
            <CartProvider>
              <WishlistProvider>
                <CompareProvider>
                  <AiAdvisorProvider>
                    <SplashIntro />
                    <Header />
                    <MainContent>
                      <PageTransition>{children}</PageTransition>
                    </MainContent>
                    <Footer />
                    <AiAdvisorWidget />
                    <MobileBottomNav />
                  </AiAdvisorProvider>
                </CompareProvider>
              </WishlistProvider>
            </CartProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

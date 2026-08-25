"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Product } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import ProductGrid from "./ProductGrid";

interface PersonalizationResult {
  personalized: boolean;
  source: "PURCHASE_HISTORY" | "BESTSELLERS";
  products: Product[];
}

// Sprint 8 §5 — always this signed-in customer's own recommendations
// (the API endpoint has no id parameter; it only ever reads req.user.id),
// sourced only from the real Sultan Noor catalog. Renders nothing for a
// guest — personalization never guesses at an anonymous visitor.
export default function PersonalizedRecommendations() {
  const { accessToken } = useAuth();
  const [result, setResult] = useState<PersonalizationResult | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setResult(null);
      return;
    }
    api
      .get<PersonalizationResult>("/personalization/recommendations", accessToken)
      .then(setResult)
      .catch(() => setResult(null));
  }, [accessToken]);

  if (!accessToken || !result || result.products.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-14">
      <h2 className="mb-6 text-lg font-bold">
        {result.personalized ? (
          <>
            پیشنهاد <span className="gradient-text">ویژه شما</span>
          </>
        ) : (
          <>
            پرفروش‌ترین‌های <span className="gradient-text">سلطان نور</span>
          </>
        )}
      </h2>
      <ProductGrid products={result.products} />
    </section>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function CheckoutCallbackContent() {
  const searchParams = useSearchParams();
  const { accessToken, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;

    const orderId = searchParams.get("orderId");
    const authority = searchParams.get("Authority");
    if (!orderId || !authority) {
      setStatus("failed");
      setMessage("اطلاعات پرداخت ناقص است.");
      return;
    }

    api
      .post<{ succeeded: boolean }>("/payments/verify", { orderId, authority }, accessToken)
      .then((res) => {
        setStatus(res.succeeded ? "success" : "failed");
        setMessage(res.succeeded ? "پرداخت شما با موفقیت انجام شد." : "پرداخت ناموفق بود.");
      })
      .catch((err) => {
        setStatus("failed");
        setMessage(err instanceof ApiError ? err.message : "خطا در تایید پرداخت");
      });
  }, [searchParams, accessToken, authLoading]);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {status === "loading" && <p>در حال بررسی نتیجه پرداخت...</p>}
      {status !== "loading" && (
        <>
          <p className={status === "success" ? "text-brand" : "text-red-500"}>{message}</p>
          <Link href="/orders" className="mt-6 inline-block rounded-lg bg-brand px-5 py-2 text-[#0b0e14]">
            مشاهده سفارش‌های من
          </Link>
        </>
      )}
    </div>
  );
}

export default function CheckoutCallbackPage() {
  return (
    <Suspense fallback={<div className="px-4 py-24 text-center">در حال بارگذاری...</div>}>
      <CheckoutCallbackContent />
    </Suspense>
  );
}

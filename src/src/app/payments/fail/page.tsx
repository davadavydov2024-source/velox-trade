"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { XCircle } from "lucide-react";

function FailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");

  useEffect(() => {
    const target = orderId ? `/profile/topup?order_id=${orderId}` : "/profile/topup";
    const t = setTimeout(() => router.replace(target), 2000);
    return () => clearTimeout(t);
  }, [orderId, router]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center gap-3">
      <XCircle size={40} className="text-red-400" />
      <h1 className="text-xl font-bold">Оплата не прошла</h1>
      <p className="text-white/50 text-sm">Вернём тебя на страницу пополнения — там можно попробовать снова.</p>
    </div>
  );
}

export default function PaymentsFailPage() {
  return (
    <Suspense fallback={null}>
      <FailInner />
    </Suspense>
  );
}

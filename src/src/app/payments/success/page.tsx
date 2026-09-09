"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

function SuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");

  useEffect(() => {
    const target = orderId ? `/profile/topup?order_id=${orderId}` : "/profile/topup";
    const t = setTimeout(() => router.replace(target), 1500);
    return () => clearTimeout(t);
  }, [orderId, router]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center gap-3">
      <CheckCircle2 size={40} className="text-green-400" />
      <h1 className="text-xl font-bold">Оплата принята</h1>
      <p className="text-white/50 text-sm">Сейчас вернём тебя в личный кабинет — баланс зачислится автоматически.</p>
    </div>
  );
}

export default function PaymentsSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}

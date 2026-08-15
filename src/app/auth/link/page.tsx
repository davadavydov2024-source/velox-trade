"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Smartphone, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getDeviceLoginRequest, respondToDeviceLogin, DeviceLoginRequest } from "@/lib/deviceLogin";

function parseDeviceHint(ua?: string): string {
  if (!ua) return "неизвестное устройство";
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  let browser = "браузер";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return `${browser}${os ? " · " + os : ""}${isMobile ? " · моб." : ""}`;
}

function LinkInner() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [request, setRequest] = useState<DeviceLoginRequest | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);

  useEffect(() => {
    if (!code) return;
    getDeviceLoginRequest(code)
      .then(setRequest)
      .catch(() => setRequest(null));
  }, [code]);

  useEffect(() => {
    if (!authLoading && !user && code) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(`/auth/link?code=${code}`)}`);
    }
  }, [authLoading, user, code, router]);

  async function respond(action: "approve" | "deny") {
    if (!code) return;
    setBusy(true);
    try {
      await respondToDeviceLogin(code, action);
      setDone(action === "approve" ? "approved" : "denied");
      toast("success", action === "approve" ? "Вход подтверждён" : "Вход отклонён");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  }

  if (!code) {
    return <p className="text-center text-white/40 py-16">Некорректная ссылка.</p>;
  }
  if (authLoading || request === undefined) {
    return <p className="text-center text-white/40 py-16">Загрузка...</p>;
  }
  if (!user) {
    return <p className="text-center text-white/40 py-16">Перенаправляем на вход...</p>;
  }

  if (done) {
    return (
      <div className="text-center py-16 space-y-2 px-4">
        {done === "approved" ? (
          <CheckCircle2 size={32} className="mx-auto text-green-400" />
        ) : (
          <XCircle size={32} className="mx-auto text-white/30" />
        )}
        <p className="text-white/60">
          {done === "approved" ? "Готово! Другое устройство сейчас войдёт автоматически." : "Вход отклонён."}
        </p>
        <Link href="/profile" className="text-accent text-sm hover:underline">
          Вернуться в профиль
        </Link>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-16 space-y-2 px-4">
        <XCircle size={32} className="mx-auto text-red-400" />
        <p className="text-white/60">Заявка на вход не найдена — возможно, срок её действия истёк.</p>
      </div>
    );
  }

  if (request.status !== "pending" || Date.now() > request.expiresAt) {
    return (
      <div className="text-center py-16 space-y-2 px-4">
        <XCircle size={32} className="mx-auto text-white/30" />
        <p className="text-white/60">
          {request.status === "approved"
            ? "Этот вход уже подтверждён."
            : request.status === "denied"
              ? "Этот вход уже был отклонён."
              : "Срок действия кода истёк — обнови QR на другом устройстве."}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card p-8 text-center space-y-5">
        <Smartphone size={36} className="mx-auto text-accent" />
        <div>
          <h1 className="text-xl font-bold mb-1">Подтвердить вход?</h1>
          <p className="text-sm text-white/50">
            Кто-то пытается войти в твой аккаунт на другом устройстве:{" "}
            <span className="text-white/80">{parseDeviceHint(request.userAgent)}</span>
          </p>
        </div>
        <div className="flex items-start gap-2 text-left text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-btn p-3">
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          Если это не ты — просто отклони заявку или закрой страницу. Никогда не пересылай эту ссылку никому, даже
          "администрации" — так выглядит попытка взлома.
        </div>
        <div className="flex gap-2">
          <button onClick={() => respond("deny")} disabled={busy} className="btn-secondary flex-1 py-3 disabled:opacity-50">
            Отклонить
          </button>
          <button onClick={() => respond("approve")} disabled={busy} className="btn-primary flex-1 py-3 disabled:opacity-50">
            {busy ? "..." : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LinkPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-16 text-center text-white/40">Загрузка...</div>}>
      <LinkInner />
    </Suspense>
  );
}

"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";

type VpnCheckStatus = "checking" | "clean" | "blocked" | "error";

const CHECK_TIMEOUT_MS = 4000;
const CACHE_KEY = "vpn-check-cache-v1";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 минут, чтобы не дёргать API на каждый переход

function readCache(): { status: VpnCheckStatus; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(status: VpnCheckStatus) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ status, ts: Date.now() }));
  } catch {
    // sessionStorage недоступен (приватный режим и т.п.) — просто пропускаем кэш
  }
}

async function checkVpn(): Promise<VpnCheckStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    // Бесплатный тариф proxycheck.io без ключа: определяет VPN/прокси/хостинг по IP клиента.
    const res = await fetch("https://proxycheck.io/v2/?vpn=1&asn=1&risk=1", {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return "error";

    const data = await res.json();
    if (data?.status !== "ok") return "error";

    // Ответ вида { status: "ok", "1.2.3.4": { proxy: "yes", type: "VPN", risk: 66 } }
    const ipKey = Object.keys(data).find((k) => k !== "status" && k !== "node");
    if (!ipKey) return "clean";

    const info = data[ipKey];
    const isProxy = info?.proxy === "yes";
    const highRisk = typeof info?.risk === "number" && info.risk >= 66;

    return isProxy || highRisk ? "blocked" : "clean";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

export function VpnGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const [status, setStatus] = useState<VpnCheckStatus>("checking");

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setStatus(cached.status);
      return;
    }

    let cancelled = false;
    checkVpn().then((result) => {
      if (cancelled) return;
      setStatus(result);
      // Ошибку сети не кэшируем — при следующем заходе стоит попробовать снова
      if (result !== "error") writeCache(result);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = isAdminUid(user?.uid) || profile?.badges?.includes("admin");
  const bypass = pathname.startsWith("/admin") || isAdmin;

  // Пока идёт проверка (или она упала с ошибкой) — не блокируем сайт, чтобы не терять
  // пользователей из-за сбоя стороннего API.
  if (status !== "blocked" || bypass) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="card p-8 max-w-md text-center space-y-4">
        <WifiOff className="mx-auto text-yellow-400" size={40} />
        <h1 className="text-xl font-bold">Обнаружен VPN или прокси</h1>
        <p className="text-white/60 text-sm">
          Похоже, ты используешь VPN, прокси или похожее соединение — из-за этого часть сайта
          (каталог, оплата, чаты) может не загружаться или работать некорректно.
        </p>
        <p className="text-white/40 text-xs">
          Отключи VPN/прокси и обнови страницу, чтобы пользоваться сайтом без ограничений.
        </p>
        <button onClick={() => window.location.reload()} className="btn-secondary px-5 py-2.5 text-sm">
          Я отключил VPN — обновить
        </button>
      </div>
    </div>
  );
}

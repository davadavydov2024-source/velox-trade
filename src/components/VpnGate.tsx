"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WifiOff, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";

type VpnCheckStatus = "checking" | "clean" | "blocked" | "error";

const CHECK_TIMEOUT_MS = 4000;
const CACHE_KEY = "vpn-check-cache-v1";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 минут, чтобы не дёргать API на каждый переход
const DISMISS_KEY = "vpn-banner-dismissed-v1";

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
    // Раньше здесь был прямой fetch на proxycheck.io — он падает с CORS-ошибкой ("blocked by
    // CORS policy"), потому что proxycheck.io не отдаёт Access-Control-Allow-Origin для браузерных
    // запросов. Теперь дёргаем свой серверный роут (api/vpn-check), который сам ходит в
    // proxycheck.io сервер-сервер, где CORS не действует.
    const res = await fetch("/api/vpn-check", { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return "error";

    const data = await res.json();
    return data?.blocked ? "blocked" : "clean";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ВАЖНО: это больше не блокирующий гейт. Раньше VPN-пользователь не мог пользоваться сайтом,
 * пока не отключит VPN — это лишнее и вредное ограничение (у многих VPN включён постоянно по
 * другим причинам, а сайт при этом реально работает, просто чуть медленнее из-за лишнего прыжка
 * через прокси-сервер). Теперь это ненавязчивый закрываемый баннер-предупреждение сверху страницы,
 * который не мешает пользоваться сайтом и не переживает обновление страницы после закрытия
 * (специально sessionStorage, а не localStorage — баннер не должен быть закрыт навсегда).
 */
export function VpnGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const [status, setStatus] = useState<VpnCheckStatus>("checking");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      // ignore
    }

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

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  const isAdmin = isAdminUid(user?.uid) || profile?.badges?.includes("admin");
  const bypass = pathname.startsWith("/admin") || isAdmin;
  const showBanner = status === "blocked" && !bypass && !dismissed;

  return (
    <>
      {showBanner && (
        <div className="sticky top-0 z-40 bg-amber-500/15 border-b border-amber-500/25 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3 text-sm">
            <WifiOff size={16} className="text-amber-400 shrink-0" />
            <p className="text-amber-200/90 flex-1">
              Похоже, ты используешь VPN или прокси — сайт может работать чуть медленнее из-за этого. Отключать
              VPN необязательно, всё должно продолжать работать.
            </p>
            <button onClick={dismiss} className="text-amber-200/60 hover:text-amber-100 shrink-0 p-1" aria-label="Закрыть">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}

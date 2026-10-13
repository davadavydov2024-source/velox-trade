"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { auth } from "@/lib/firebase";

/**
 * Финиш входа через Telegram: токен приходит во фрагменте адреса (#token=...). Сразу убираем его
 * из адресной строки, входим в Firebase и (для нового аккаунта) применяем реферальный код.
 */
export default function TelegramFinishPage() {
  const router = useRouter();
  const { loginWithCustomToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token");
    const ref = params.get("ref");
    window.history.replaceState(null, "", window.location.pathname);

    if (!token) {
      setError("Не хватает данных для входа. Попробуй ещё раз.");
      return;
    }

    (async () => {
      try {
        await loginWithCustomToken(token);
        if (ref) {
          try {
            const idToken = await auth.currentUser?.getIdToken();
            if (idToken) {
              await fetch("/api/auth/apply-referral", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ code: ref }),
              });
            }
          } catch {
            // бонус за приглашение не критичен для входа
          }
        }
        router.replace("/profile");
      } catch {
        setError("Не удалось войти через Telegram. Попробуй ещё раз.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      {error ? (
        <>
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => router.replace("/auth/login")} className="btn-secondary px-5 py-2.5 text-sm">
            Вернуться ко входу
          </button>
        </>
      ) : (
        <p className="text-white/40">Входим через Telegram...</p>
      )}
    </div>
  );
}

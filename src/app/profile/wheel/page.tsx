"use client";

import { useState } from "react";
import { Disc3, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";

interface PrizeResult {
  type: "product" | "balance" | "nothing";
  name: string;
  image?: string;
  balanceRub?: number;
}

export default function WheelPage() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PrizeResult | null>(null);

  async function handleSpin(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast("warning", "Войди в аккаунт, чтобы крутить колесо");
      return;
    }
    if (!code.trim()) {
      toast("warning", "Введи промокод для колеса");
      return;
    }
    setResult(null);
    setSpinning(true);
    try {
      const idToken = await user.getIdToken();
      // Небольшая пауза для ощущения "вращения", прежде чем показать результат.
      const [res] = await Promise.all([
        fetch("/api/wheel/spin", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ code }),
        }),
        new Promise((r) => setTimeout(r, 1400)),
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось прокрутить колесо");
      setResult(data.prize);
      await refreshProfile();
      setCode("");
    } catch (err: any) {
      toast("error", err.message || "Не удалось прокрутить колесо");
    } finally {
      setSpinning(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-bold flex items-center justify-center gap-2">
          <Disc3 size={22} className="text-accent" /> Колесо Фортуны
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Введи промокод колеса — его можно активировать раз в 24 часа и получить случайный приз.
        </p>
      </div>

      <div className="card p-8 flex items-center justify-center" style={{ minHeight: 220 }}>
        {spinning ? (
          <div className="text-center">
            <Disc3 size={64} className="text-accent mx-auto animate-spin" style={{ animationDuration: "0.6s" }} />
            <p className="text-sm text-white/40 mt-3">Крутим...</p>
          </div>
        ) : result ? (
          <div className="text-center animate-in fade-in">
            <Sparkles size={40} className="text-accent mx-auto mb-2" />
            {result.type === "nothing" ? (
              <p className="text-lg font-medium text-white/60">{result.name}</p>
            ) : (
              <>
                <p className="text-lg font-bold">{result.name}</p>
                {result.type === "balance" && <p className="text-accent text-sm mt-1">Начислено на баланс!</p>}
                {result.type === "product" && <p className="text-accent text-sm mt-1">Товар уже в твоих заказах!</p>}
              </>
            )}
          </div>
        ) : (
          <Disc3 size={64} className="text-white/15" />
        )}
      </div>

      <form onSubmit={handleSpin} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Промокод колеса"
          disabled={spinning}
          className="input-field py-2.5 text-sm flex-1 uppercase"
        />
        <button disabled={spinning || !code.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
          {spinning ? "..." : "Крутить"}
        </button>
      </form>
    </div>
  );
}

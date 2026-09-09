"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";

/**
 * Своя капча вместо reCAPTCHA/App Check (см. api/captcha/route.ts). Показывает простой вопрос
 * (например "5 + 3 = ?"), после верного ответа отдаёт passToken наверх через onVerified — его
 * дальше нужно приложить к запросу как заголовок X-Captcha-Token (см. lib/captcha.ts на клиенте).
 */
export function Captcha({ onVerified }: { onVerified: (passToken: string | null) => void }) {
  const [question, setQuestion] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadQuestion() {
    setError(null);
    setVerified(false);
    setAnswer("");
    onVerified(null);
    try {
      const res = await fetch("/api/captcha");
      const data = await res.json();
      setQuestion(data.question);
      setChallengeToken(data.challengeToken);
    } catch {
      setError("Не удалось загрузить капчу — попробуй обновить.");
    }
  }

  useEffect(() => {
    loadQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCheck() {
    if (!challengeToken || !answer.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, userAnswer: Number(answer) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Неверный ответ");
        loadQuestion();
        return;
      }
      setVerified(true);
      onVerified(data.passToken);
    } catch {
      setError("Ошибка проверки — попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  if (verified) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-400 py-2">
        <CheckCircle2 size={16} /> Проверка пройдена
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-white/70 whitespace-nowrap">{question ?? "Загрузка..."}</span>
        <input
          type="number"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          placeholder="Ответ"
          className="input-field py-2 flex-1"
        />
        <button type="button" onClick={loadQuestion} className="btn-secondary p-2" title="Другой вопрос">
          <RefreshCw size={16} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={handleCheck}
        disabled={loading || !answer.trim()}
        className="btn-primary w-full py-2 text-sm disabled:opacity-50"
      >
        {loading ? "Проверяем..." : "Подтвердить"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
      toast("success", "Письмо для восстановления пароля отправлено");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось отправить письмо. Проверь email и настройки EmailJS на сервере.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold mb-1">Восстановление пароля</h1>
        <p className="text-white/40 text-sm mb-6">Укажи email, на который зарегистрирован аккаунт</p>

        {sent ? (
          <p className="text-green-400 text-sm">
            Письмо отправлено на {email}. Проверьте почту и перейдите по ссылке для сброса пароля.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="input-field pl-10"
              />
            </div>
            <button disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
              {loading ? "Отправляем..." : "Отправить ссылку"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-white/40 mt-6">
          <Link href="/auth/login" className="text-accent hover:underline">
            ← Вернуться ко входу
          </Link>
        </p>
      </div>
    </div>
  );
}

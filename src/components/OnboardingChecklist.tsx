"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { CheckCircle2, Circle } from "lucide-react";
import { db } from "@/lib/firebase";
import { getOrdersForUser } from "@/lib/users";
import { useAuth } from "@/lib/authContext";

interface Step {
  label: string;
  done: boolean;
  href: string;
}

export function OnboardingChecklist() {
  const { user, profile } = useAuth();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (localStorage.getItem("onboardingDismissed") === "1") {
      setDismissed(true);
      return;
    }

    Promise.all([
      getDoc(doc(db, "telegramLinks", user.uid)).then((s) => s.exists()),
      getOrdersForUser(user.uid).then((orders) => orders.length > 0),
    ]).then(([hasTelegram, hasOrder]) => {
      setSteps([
        { label: "Заполните профиль (ник и юзернейм)", done: !!profile.username, href: "/profile" },
        { label: "Привяжите Telegram — уведомления о заказах и чатах", done: hasTelegram, href: "/profile/security" },
        { label: "Пополните баланс", done: profile.balance > 0, href: "/profile/topup" },
        { label: "Сделайте первую покупку", done: hasOrder, href: "/catalog" },
      ]);
    });
  }, [user, profile]);

  if (!steps || dismissed) return null;
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-sm">Начало работы ({doneCount}/{steps.length})</p>
        <button
          onClick={() => {
            localStorage.setItem("onboardingDismissed", "1");
            setDismissed(true);
          }}
          className="text-xs text-white/30 hover:text-white/60"
        >
          Скрыть
        </button>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 mb-4 overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <div className="space-y-2">
        {steps.map((s) => (
          <Link key={s.label} href={s.href} className="flex items-center gap-2.5 text-sm group">
            {s.done ? (
              <CheckCircle2 size={16} className="text-accent shrink-0" />
            ) : (
              <Circle size={16} className="text-white/20 shrink-0" />
            )}
            <span className={s.done ? "text-white/40 line-through" : "text-white/70 group-hover:text-white"}>{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

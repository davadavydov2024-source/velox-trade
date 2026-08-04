"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X, Pin, ExternalLink } from "lucide-react";
import { getActiveNotifications } from "@/lib/notifications";
import { AppNotification } from "@/types";

const DISMISSED_KEY = "dismissedNotifications";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

const TABS: { key: "all" | AppNotification["category"]; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "trade", label: "Торговля" },
  { key: "transactions", label: "Транзакции" },
];

export function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDismissed(readDismissed());
    getActiveNotifications()
      .then(setNotifications)
      .catch(() => {
        // Уведомления не настроены или Firestore недоступен — колокольчик просто не покажет бейдж
      });
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  }

  const visible = notifications.filter((n) => !dismissed.includes(n.id));
  const filtered = tab === "all" ? visible : visible.filter((n) => n.category === tab);
  const unreadCount = visible.length;

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen((v) => !v)} className="relative btn-secondary py-2 px-3" aria-label="Уведомления">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-accent text-black text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[92vw] max-w-sm card p-0 overflow-hidden shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <p className="font-bold">Уведомления</p>
              {unreadCount > 0 && (
                <span className="bg-accent text-black text-xs font-bold rounded-md w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-btn hover:bg-white/5 text-white/50">
              <X size={16} />
            </button>
          </div>

          <div className="flex gap-1 p-2 border-b border-border">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`flex-1 text-xs font-medium py-2 rounded-btn transition-colors ${
                  tab === tb.key ? "bg-accent text-black" : "text-white/50 hover:bg-white/5"
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
            {filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-white/40">Пока пусто</p>
            ) : (
              filtered.map((n) => (
                <div key={n.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: n.color || "var(--color-accent)" }}
                      />
                      <p className="font-semibold text-sm truncate">{n.title}</p>
                    </div>
                    {n.pinned ? (
                      <Pin size={14} className="text-white/30 shrink-0" />
                    ) : (
                      <button onClick={() => dismiss(n.id)} className="text-white/30 hover:text-white/70 shrink-0" aria-label="Скрыть">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-white/50 mt-1.5 whitespace-pre-line">{n.text}</p>
                  {n.buttonText && n.buttonLink && (
                    <a
                      href={n.buttonLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary w-full mt-3 py-2.5 text-sm flex items-center justify-center gap-1.5"
                    >
                      {n.buttonText} <ExternalLink size={13} />
                    </a>
                  )}
                  <p className="text-[10px] text-white/30 mt-2">
                    {new Date(n.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {new Date(n.createdAt).toLocaleDateString("ru-RU")}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

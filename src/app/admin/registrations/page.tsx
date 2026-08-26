"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, AlertTriangle, Copy } from "lucide-react";
import { getRegistrationLog, getAllUsers } from "@/lib/users";
import { UserProfile } from "@/types";
import { useToast } from "@/lib/toastContext";

interface LogEntry {
  uid: string;
  ip: string;
  userAgent: string;
  createdAt: number;
}

const SUSPICIOUS_THRESHOLD = 3; // тот же порог, что и в api/auth/log-registration — держим синхронно

export default function AdminRegistrationsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlySuspicious, setOnlySuspicious] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([getRegistrationLog(), getAllUsers()])
      .then(([log, allUsers]) => {
        setEntries(log);
        setUsers(new Map(allUsers.map((u) => [u.uid, u])));
      })
      .finally(() => setLoading(false));
  }, []);

  // Сколько раз встречается каждый IP — используется и для фильтра "только подозрительные",
  // и для бейджа количества рядом с каждой записью.
  const ipCounts = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => map.set(e.ip, (map.get(e.ip) ?? 0) + 1));
    return map;
  }, [entries]);

  const filtered = entries.filter((e) => {
    if (onlySuspicious && (ipCounts.get(e.ip) ?? 0) < SUSPICIOUS_THRESHOLD) return false;
    if (!search) return true;
    const u = users.get(e.uid);
    return (
      e.ip.includes(search) ||
      e.uid.includes(search) ||
      u?.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u?.email.toLowerCase().includes(search.toLowerCase())
    );
  });

  function copyIp(ip: string) {
    navigator.clipboard.writeText(ip).then(() => toast("success", "IP скопирован"));
  }

  const suspiciousIpCount = [...ipCounts.values()].filter((c) => c >= SUSPICIOUS_THRESHOLD).length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">IP-адреса регистраций</h1>
      <p className="text-sm text-white/40 max-w-2xl mb-5">
        Список всех зарегистрированных аккаунтов с IP-адресом, с которого они регистрировались. При{" "}
        {SUSPICIOUS_THRESHOLD}+ регистрациях с одного IP админам автоматически приходит уведомление
        (Telegram/push) — сюда можно зайти и проверить детали в любой момент.
      </p>

      {suspiciousIpCount > 0 && (
        <div className="card p-3 mb-4 flex items-center gap-2 border border-red-500/30 bg-red-500/5">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            Подозрительных IP (≥{SUSPICIOUS_THRESHOLD} регистраций): <strong>{suspiciousIpCount}</strong>
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по IP, имени, email или UID"
            className="input-field pl-9 py-2.5 w-full"
          />
        </div>
        <button
          onClick={() => setOnlySuspicious((v) => !v)}
          className={`px-4 py-2.5 rounded-btn text-sm border transition-all whitespace-nowrap ${
            onlySuspicious ? "border-red-500/50 bg-red-500/10 text-red-300" : "border-transparent bg-surface text-white/50"
          }`}
        >
          Только подозрительные
        </button>
      </div>

      {loading ? (
        <p className="text-white/40 text-sm">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <p className="text-white/40 text-sm">Ничего не найдено.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const u = users.get(e.uid);
            const count = ipCounts.get(e.ip) ?? 1;
            const isSuspicious = count >= SUSPICIOUS_THRESHOLD;
            return (
              <div
                key={e.uid}
                className={`card p-3 flex items-center justify-between gap-3 flex-wrap ${isSuspicious ? "border border-red-500/30" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u?.displayName ?? "Профиль не найден"}</p>
                  <p className="text-xs text-white/40 truncate">{u?.email ?? e.uid}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    onClick={() => copyIp(e.ip)}
                    className={`flex items-center gap-1 font-mono px-2 py-1 rounded-md ${
                      isSuspicious ? "bg-red-500/15 text-red-300" : "bg-surface text-white/60"
                    }`}
                    title="Скопировать IP"
                  >
                    {e.ip} <Copy size={11} />
                  </button>
                  {count > 1 && (
                    <span className={`px-2 py-1 rounded-md ${isSuspicious ? "bg-red-500/15 text-red-300" : "bg-surface text-white/40"}`}>
                      {count} аккаунтов с этого IP
                    </span>
                  )}
                  <span className="text-white/30 whitespace-nowrap">{new Date(e.createdAt).toLocaleString("ru")}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

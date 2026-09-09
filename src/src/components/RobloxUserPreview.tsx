"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export interface RobloxLookupResult {
  found: boolean;
  userId?: number;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  profileUrl?: string;
}

/** Debounce + запрос к /api/roblox/lookup. Вынесено отдельно, чтобы админка и покупатель использовали одну и ту же логику. */
export function useRobloxLookup(username: string, debounceMs = 500) {
  const [result, setResult] = useState<RobloxLookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/roblox/lookup?username=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((data: RobloxLookupResult) => setResult(data))
        .catch(() => setResult({ found: false }))
        .finally(() => setLoading(false));
    }, debounceMs);
    return () => clearTimeout(t);
  }, [username, debounceMs]);

  return { result, loading };
}

/** Показывает аватарку + имя найденного аккаунта Roblox прямо под полем ввода ника — чтобы можно
 * было визуально убедиться, что ник введён верно, до того как передавать/принимать предмет. */
export function RobloxUserPreview({ username }: { username: string }) {
  const { result, loading } = useRobloxLookup(username);

  if (!username.trim()) return null;

  if (loading) {
    return (
      <p className="text-xs text-white/30 flex items-center gap-1.5">
        <Loader2 size={12} className="animate-spin" /> Ищем аккаунт в Roblox...
      </p>
    );
  }

  if (!result || !result.found) {
    return (
      <p className="text-xs text-red-400 flex items-center gap-1.5">
        <XCircle size={12} /> Аккаунт с таким ником не найден — проверь написание
      </p>
    );
  }

  return (
    <a
      href={result.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-2 rounded-btn bg-white/5 hover:bg-white/10 transition-colors"
    >
      {result.avatarUrl && (
        <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 bg-black/30">
          <Image src={result.avatarUrl} alt="" fill className="object-cover" sizes="32px" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium truncate flex items-center gap-1">
          {result.displayName} <CheckCircle2 size={11} className="text-green-400 shrink-0" />
        </p>
        <p className="text-[10px] text-white/40 truncate">@{result.username}</p>
      </div>
    </a>
  );
}

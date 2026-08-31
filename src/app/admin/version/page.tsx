"use client";

import { useEffect, useState } from "react";
import { GitCommit, RefreshCw } from "lucide-react";

interface VersionInfo {
  commitSha: string;
  commitMessage: string | null;
  branch: string;
  env: string;
  coldStartAt: number;
}

export default function AdminVersionPage() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/version", { cache: "no-store" });
    setInfo(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <GitCommit size={22} /> Версия деплоя
      </h1>
      <p className="text-sm text-white/40 max-w-2xl mb-5">
        Показывает, какой именно код сейчас реально работает на сайте — полезно сверить с последним коммитом в
        GitHub после пуша, чтобы убедиться, что деплой прошёл, а не просто «запушено».
      </p>

      {loading || !info ? (
        <p className="text-white/40 text-sm">Загрузка...</p>
      ) : (
        <div className="card p-5 space-y-3 max-w-lg">
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Commit</span>
            <span className="font-mono">{info.commitSha}</span>
          </div>
          {info.commitMessage && (
            <div className="flex justify-between text-sm gap-4">
              <span className="text-white/40 shrink-0">Сообщение</span>
              <span className="text-right">{info.commitMessage}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Ветка</span>
            <span className="font-mono">{info.branch}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Окружение</span>
            <span className="font-mono">{info.env}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Сервер запущен</span>
            <span>{new Date(info.coldStartAt).toLocaleString("ru")}</span>
          </div>
          <p className="text-xs text-white/30 pt-2 border-t border-border">
            «Сервер запущен» — момент, когда эта функция впервые отработала после последнего деплоя (Vercel
            переиспользует инстансы между запросами) — примерное время обновления, не точное время сборки.
          </p>
        </div>
      )}

      <button onClick={load} className="btn-secondary px-4 py-2 text-sm flex items-center gap-1.5 mt-4">
        <RefreshCw size={14} /> Обновить
      </button>
    </div>
  );
}

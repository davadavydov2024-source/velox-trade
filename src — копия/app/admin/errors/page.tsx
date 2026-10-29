"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Bug, Copy, Trash2, ExternalLink } from "lucide-react";
import { useToast } from "@/lib/toastContext";

interface ClientError {
  id: string;
  message: string;
  stack: string;
  source: string;
  url: string;
  userAgent: string;
  createdAt: number;
}

export default function AdminErrorsPage() {
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    const snap = await getDocs(query(collection(db, "clientErrors"), orderBy("createdAt", "desc"), limit(100)));
    setErrors(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientError));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function copyError(e: ClientError) {
    const text = `${e.message}\n\nURL: ${e.url}\nИсточник: ${e.source}\nВремя: ${new Date(e.createdAt).toLocaleString("ru")}\n\n${e.stack}`;
    navigator.clipboard.writeText(text).then(() => toast("success", "Скопировано — можно вставить в чат"));
  }

  async function clearAll() {
    if (!confirm(`Удалить все ${errors.length} записей?`)) return;
    await Promise.all(errors.map((e) => deleteDoc(doc(db, "clientErrors", e.id))));
    toast("success", "Очищено");
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bug size={22} /> Ошибки на сайте
        </h1>
        {errors.length > 0 && (
          <button onClick={clearAll} className="btn-secondary px-3 py-2 text-xs flex items-center gap-1.5">
            <Trash2 size={13} /> Очистить всё
          </button>
        )}
      </div>
      <p className="text-sm text-white/40 max-w-2xl mb-5">
        Последние 100 ошибок из браузеров пользователей — собираются автоматически, без ручного открытия консоли.
        Нажми на «Скопировать», чтобы прислать текст ошибки в чат для починки.
      </p>

      {loading ? (
        <p className="text-white/40 text-sm">Загрузка...</p>
      ) : errors.length === 0 ? (
        <p className="text-white/40 text-sm">Ошибок нет 🎉</p>
      ) : (
        <div className="space-y-2">
          {errors.map((e) => (
            <div key={e.id} className="card p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono text-red-300 break-words">{e.message}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-white/30 flex-wrap">
                    <span>{new Date(e.createdAt).toLocaleString("ru")}</span>
                    <span className="px-1.5 py-0.5 bg-surface rounded">{e.source}</span>
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-white/60 truncate max-w-xs">
                      {e.url} <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
                <button onClick={() => copyError(e)} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 shrink-0">
                  <Copy size={12} /> Скопировать
                </button>
              </div>
              {e.stack && (
                <details className="mt-2">
                  <summary className="text-xs text-white/30 cursor-pointer hover:text-white/50">Stack trace</summary>
                  <pre className="text-[10px] text-white/40 mt-1 whitespace-pre-wrap break-words">{e.stack}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

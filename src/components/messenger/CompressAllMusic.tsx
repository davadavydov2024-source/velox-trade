"use client";

import { useRef, useState } from "react";
import { Zap } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { uploadMedia } from "@/lib/messenger/client";
import { compressAudio } from "@/lib/messenger/compressAudio";
import { useToast } from "@/lib/toastContext";
import type { MusicTrack } from "@/lib/messenger/music";
import { Spinner } from "./ui";

type St = "wait" | "work" | "ok" | "skip" | "err";
interface Row { id: string; label: string; st: St; note?: string }
const MB = 1048576;

/** Размер и тип файла без скачивания: HEAD, а если не вышло — запрос одного байта с Range. */
async function probe(url: string): Promise<{ size: number; type: string }> {
  try {
    const h = await fetch(url, { method: "HEAD" });
    const size = Number(h.headers.get("content-length") || 0);
    if (h.ok && size) return { size, type: h.headers.get("content-type") || "" };
  } catch {}
  const g = await fetch(url, { headers: { Range: "bytes=0-0" } });
  const total = Number(/\/(\d+)$/.exec(g.headers.get("content-range") || "")?.[1] || g.headers.get("content-length") || 0);
  g.body?.cancel().catch(() => {});
  return { size: total, type: g.headers.get("content-type") || "" };
}

/**
 * «Оптимизировать все песни»: проходит по каталогу, находит тяжёлые (больше 6 МБ или с высоким битрейтом) и файлы с неверным типом,
 * скачивает, перекодирует в mp3 с нужным битрейтом в браузере администратора, загружает новый файл и подменяет ссылку у песни.
 * Название, обложка, текст и счётчик прослушиваний остаются. Старый файл удаляется.
 */
export function CompressAllMusic({ tracks, onDone }: { tracks: MusicTrack[]; onDone: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [kbps, setKbps] = useState(128);
  const [summary, setSummary] = useState("");
  const stop = useRef(false);

  const set = (id: string, p: Partial<Row>) => setRows((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const run = async () => {
    if (running || !tracks.length) return;
    if (!confirm(`Проверить ${tracks.length} песен и заменить тяжёлые на сжатые версии (${kbps} кбит/с)? Это долго и нужен включённый экран. Лучше на компьютере.`)) return;
    stop.current = false;
    setRunning(true);
    setSummary("");
    const list = [...tracks];
    setRows(list.map((t) => ({ id: t.id, label: `${t.artist} — ${t.title}`, st: "wait" as St })));
    let saved = 0, done = 0, failed = 0;
    for (const t of list) {
      if (stop.current) break;
      set(t.id, { st: "work", note: "Проверяю…" });
      try {
        const { size, type } = await probe(t.audioUrl);
        const rate = t.duration && size ? (size * 8) / t.duration / 1000 : 0;
        const heavy = size > 6 * MB || rate > kbps * 1.25 || (!t.duration && size > 4 * MB);
        const badType = !!type && !type.startsWith("audio/");
        if (!heavy && !badType) { set(t.id, { st: "skip", note: `Уже лёгкая (${(size / MB).toFixed(1)} МБ)` }); continue; }

        set(t.id, { note: "Скачиваю…" });
        const res = await fetch(t.audioUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const src = new File([blob], "track.mp3", { type: blob.type || "audio/mpeg" });

        set(t.id, { note: "Сжимаю…" });
        let out: File;
        try {
          const r = await compressAudio(src, kbps, (p) => set(t.id, { note: `Сжимаю ${Math.round(p * 100)}%` }));
          if (r.compressed) out = r.file;
          else if (badType) out = new File([blob], "track.mp3", { type: "audio/mpeg" }); // уже лёгкая, но с неверным типом — просто перезаливаем с правильным
          else { set(t.id, { st: "skip", note: "Не удалось уменьшить" }); continue; }
        } catch {
          throw new Error("Файл не читается (повреждён или неподдерживаемый формат)");
        }
        if (out.size > 30 * MB) throw new Error("После сжатия больше 30 МБ");

        set(t.id, { note: "Загружаю…" });
        const url = await uploadMedia(out, "music", "mp3");
        const rr = await authedFetch("/api/admin/messenger/music", { method: "POST", body: JSON.stringify({ action: "replaceAudio", id: t.id, audioUrl: url }) });
        if (!rr.ok) throw new Error((await rr.json().catch(() => ({}))).error || "Не удалось заменить файл");
        saved += Math.max(0, size - out.size);
        done++;
        set(t.id, { st: "ok", note: `${(size / MB).toFixed(1)} → ${(out.size / MB).toFixed(1)} МБ` });
      } catch (e: any) {
        failed++;
        set(t.id, { st: "err", note: e?.message || "Ошибка" });
      }
    }
    setRunning(false);
    setSummary(`Готово: заменено ${done}, ошибок ${failed}, освобождено ${(saved / MB).toFixed(1)} МБ${stop.current ? " (остановлено)" : ""}`);
    toast(failed ? "info" : "success", done ? `Оптимизировано песен: ${done}` : "Менять нечего");
    if (done) onDone();
  };

  return (
    <>
      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Оптимизация каталога</p>
      <div className="px-4 flex flex-col gap-2.5">
        <div className="mx-card px-4 py-3 flex flex-col gap-2.5">
          <p className="text-[14px] mx-muted">Если песни не запускаются или грузятся слишком долго, нажмите: тяжёлые файлы каталога перекодируются в лёгкий mp3. Названия, обложки и тексты не меняются.</p>
          <label className="flex items-center gap-2 text-[14px]">Качество:
            <select value={kbps} disabled={running} onChange={(e) => setKbps(Number(e.target.value))} className="mx-input" style={{ padding: "6px 10px", width: "auto" }}>
              <option value={96}>96 кбит/с (самые лёгкие)</option>
              <option value={128}>128 кбит/с (рекомендую)</option>
              <option value={160}>160 кбит/с (лучше звук)</option>
            </select>
          </label>
          {running
            ? <button className="mx-btn" onClick={() => { stop.current = true; }}>Остановить после текущей</button>
            : <button className="mx-btn flex items-center justify-center gap-2" disabled={!tracks.length} onClick={run}><Zap size={18} />Оптимизировать все песни ({tracks.length})</button>}
          {summary && <p className="text-[13.5px]" style={{ color: "var(--mx-accent)" }}>{summary}</p>}
        </div>
        {rows.length > 0 && (
          <div className="mx-card">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-4 py-2">
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{r.label}</span>{r.note && <span className="block text-[12px] mx-muted truncate" style={r.st === "err" ? { color: "var(--mx-danger)" } : undefined}>{r.note}</span>}</span>
                <span className="w-6 flex justify-center shrink-0 text-[15px]">{r.st === "work" ? <Spinner size={16} /> : r.st === "ok" ? "✅" : r.st === "skip" ? "➖" : r.st === "err" ? "❌" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

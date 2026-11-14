"use client";

import { useRef, useState } from "react";
import { Zap } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { uploadMedia } from "@/lib/messenger/client";
import { compressAudio } from "@/lib/messenger/compressAudio";
import { fileFingerprint } from "@/lib/messenger/id3";
import { shrinkImage } from "@/lib/messenger/image";
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

async function admin(body: Record<string, unknown>) {
  const r = await authedFetch("/api/admin/messenger/music", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Не удалось сохранить");
}

/**
 * «Оптимизировать все песни». Для каждой песни каталога:
 *  1) тяжёлый файл (больше 6 МБ / высокий битрейт / неверный тип) перекодируется в лёгкий mp3 и подменяется;
 *  2) создаётся лёгкая копия 64 кбит/с — плеер включает её сам при медленном интернете или экономии трафика;
 *  3) считается громкость (все песни звучат ровно) и отпечаток файла (защита от дублей);
 *  4) тяжёлая обложка уменьшается до 512 px.
 * Название, текст и счётчик прослушиваний остаются. Старые файлы удаляются.
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
    if (!confirm(`Оптимизировать ${tracks.length} песен (основной файл ${kbps} кбит/с, лёгкая копия, громкость, обложки)? Это долго, нужен включённый экран. Лучше на компьютере.`)) return;
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
        const needLite = !t.liteUrl;
        const needNorm = t.norm === undefined;
        const needFp = !t.fp;
        let needCover = false;
        if (t.coverUrl) { try { needCover = (await probe(t.coverUrl)).size > 150 * 1024; } catch {} }
        if (!heavy && !badType && !needLite && !needNorm && !needFp && !needCover) { set(t.id, { st: "skip", note: `Уже оптимизирована (${(size / MB).toFixed(1)} МБ)` }); continue; }

        const meta: Record<string, unknown> = {};
        let newMain: string | null = null;
        let mainSize = size;
        let norm: number | undefined;
        let liteUrl: string | undefined;

        if (heavy || badType || needLite || needNorm || needFp) {
          set(t.id, { note: "Скачиваю…" });
          const res = await fetch(t.audioUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (needFp) { const fp = await fileFingerprint(blob); if (fp) meta.fp = fp; }
          const src = new File([blob], "track.mp3", { type: blob.type || "audio/mpeg" });
          let out: File = src;

          if (heavy || badType || needLite || needNorm) {
            try {
              if (heavy || badType) {
                set(t.id, { note: "Сжимаю…" });
                const r = await compressAudio(src, kbps, (p) => set(t.id, { note: `Сжимаю ${Math.round(p * 100)}%` }));
                norm = r.norm;
                if (r.compressed) out = r.file;
                else if (badType) out = new File([blob], "track.mp3", { type: "audio/mpeg" }); // лёгкая, но с неверным типом — перезаливаем с правильным
              }
              if (needLite || needNorm) {
                set(t.id, { note: "Лёгкая копия…" });
                const l = await compressAudio(out, 64, (p) => set(t.id, { note: `Лёгкая копия ${Math.round(p * 100)}%` }));
                if (norm === undefined) norm = l.norm;
                if (needLite && l.compressed && l.file.size < 30 * MB) {
                  set(t.id, { note: "Загружаю копию…" });
                  liteUrl = await uploadMedia(l.file, "music", "mp3");
                }
              }
            } catch {
              throw new Error("Файл не читается (повреждён или неподдерживаемый формат)");
            }
          }
          if ((out !== src || badType) && out.size <= 30 * MB) {
            set(t.id, { note: "Загружаю…" });
            newMain = await uploadMedia(out, "music", "mp3");
            mainSize = out.size;
          }
        }

        if (needCover && t.coverUrl) {
          set(t.id, { note: "Обложка…" });
          try {
            const cb = await (await fetch(t.coverUrl)).blob();
            const small = await shrinkImage(cb, 512);
            if (small && small.size < cb.size * 0.7) meta.coverUrl = await uploadMedia(small, "music-cover", "jpg");
          } catch {}
        }

        set(t.id, { note: "Сохраняю…" });
        if (newMain) {
          await admin({ action: "replaceAudio", id: t.id, audioUrl: newMain, ...(liteUrl ? { liteUrl } : {}), ...(norm !== undefined ? { norm } : {}) });
          if (Object.keys(meta).length) await admin({ action: "setMeta", id: t.id, ...meta });
        } else {
          const m2 = { ...meta, ...(liteUrl ? { liteUrl } : {}), ...(norm !== undefined && needNorm ? { norm } : {}) };
          if (!Object.keys(m2).length) { set(t.id, { st: "skip", note: "Менять нечего" }); continue; }
          await admin({ action: "setMeta", id: t.id, ...m2 });
        }
        saved += Math.max(0, size - mainSize);
        done++;
        set(t.id, { st: "ok", note: [newMain ? `${(size / MB).toFixed(1)} → ${(mainSize / MB).toFixed(1)} МБ` : "", liteUrl ? "лёгкая копия" : "", norm !== undefined ? "громкость" : "", meta.coverUrl ? "обложка" : ""].filter(Boolean).join(" · ") || "готово" });
      } catch (e: any) {
        failed++;
        set(t.id, { st: "err", note: e?.message || "Ошибка" });
      }
    }
    setRunning(false);
    setSummary(`Готово: оптимизировано ${done}, ошибок ${failed}, освобождено ${(saved / MB).toFixed(1)} МБ${stop.current ? " (остановлено)" : ""}`);
    toast(failed ? "info" : "success", done ? `Оптимизировано песен: ${done}` : "Менять нечего");
    if (done) onDone();
  };

  return (
    <>
      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Оптимизация каталога</p>
      <div className="px-4 flex flex-col gap-2.5">
        <div className="mx-card px-4 py-3 flex flex-col gap-2.5">
          <p className="text-[14px] mx-muted">Если песни не запускаются или грузятся долго, нажмите: тяжёлые файлы станут лёгкими, у каждой песни появится копия для медленного интернета, выровняется громкость и уменьшатся обложки. Названия и тексты не меняются.</p>
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

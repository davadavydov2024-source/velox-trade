"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import type { MusicTrack } from "@/lib/messenger/music";
import { Sheet, Spinner } from "./ui";

const hex = (u8: Uint8Array) => Array.from(u8.slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join(" ");

/** По первым байтам файла понимаем, что это на самом деле. */
function sniff(u8: Uint8Array): string {
  const s = String.fromCharCode(...Array.from(u8.slice(0, 4)));
  if (s.startsWith("ID3")) return "ID3-тег — похоже на mp3 ✅";
  if (u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0) return "MPEG-аудиокадр — похоже на mp3 ✅";
  if (s === "RIFF") return "WAV";
  if (s === "OggS") return "OGG";
  if (s === "fLaC") return "FLAC";
  if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) return "MP4/M4A (контейнер ftyp)";
  if (u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) return "WebM/Matroska";
  if (s.startsWith("<") || s.startsWith("{")) return "это НЕ аудио, а текст/HTML/JSON (похоже на страницу ошибки) ❌";
  return "неизвестный формат ❌";
}

/** Пробуем реально открыть источник в <audio> и ждём результат до 10 секунд. */
function audioTest(src: string): Promise<string> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "auto";
    const done = (m: string) => { clearTimeout(tm); a.removeAttribute("src"); resolve(m); };
    const tm = setTimeout(() => done(`⏱ за 10 с не загрузилось: readyState=${a.readyState}, networkState=${a.networkState}`), 10000);
    a.addEventListener("canplay", () => done(`✅ готов к воспроизведению, длительность ${Number.isFinite(a.duration) ? a.duration.toFixed(1) : "?"} с`));
    a.addEventListener("error", () => done(`❌ ошибка плеера, код ${a.error?.code ?? "?"}${a.error?.message ? ` (${a.error.message})` : ""} [1=прервано, 2=сеть, 3=не расшифровать, 4=формат/ссылка не подходят]`));
    a.src = src;
    a.load();
  });
}

export async function runMusicDiagnostics(t: MusicTrack): Promise<string> {
  const L: string[] = [];
  L.push(`Трек: ${t.artist} — ${t.title}`);
  L.push(`Ссылка: ${t.audioUrl}`);
  L.push(`Браузер: ${navigator.userAgent}`);
  L.push(`Интернет: ${navigator.onLine ? "онлайн" : "офлайн"}${(navigator as any).connection?.effectiveType ? `, ${(navigator as any).connection.effectiveType}` : ""}`);
  const probe = document.createElement("audio");
  L.push(`Поддержка mp3 в браузере: ${probe.canPlayType("audio/mpeg") || "нет"}`);
  L.push("");

  // 1) что отдаёт сервер
  let ctype = "";
  try {
    const t0 = performance.now();
    const res = await fetch(t.audioUrl, { headers: { Range: "bytes=0-4095" } });
    const ms = Math.round(performance.now() - t0);
    ctype = res.headers.get("content-type") ?? "";
    L.push(`Сервер: HTTP ${res.status}, ${ms} мс`);
    L.push(`Content-Type: ${ctype || "—"}`);
    L.push(`Content-Range/Length: ${res.headers.get("content-range") ?? res.headers.get("content-length") ?? "—"}`);
    L.push(`Accept-Ranges: ${res.headers.get("accept-ranges") ?? "—"}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    L.push(`Получено байт: ${buf.length}`);
    L.push(`Первые байты: ${hex(buf)}`);
    L.push(`Файл: ${sniff(buf)}`);
  } catch (e: any) {
    L.push(`❌ Сервер недоступен из браузера: ${e?.message ?? e} (интернет, блокировка домена или CORS)`);
  }
  L.push("");

  // 2) потоковое воспроизведение по ссылке
  L.push(`Плеер по ссылке: ${await audioTest(t.audioUrl)}`);

  // 3) целиком скачать и проиграть из памяти
  try {
    const res = await fetch(t.audioUrl);
    const blob = await res.blob();
    L.push(`Скачано целиком: ${(blob.size / 1048576).toFixed(2)} МБ, тип «${blob.type || "—"}»`);
    const typed = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: "audio/mpeg" });
    const url = URL.createObjectURL(typed);
    L.push(`Плеер из памяти: ${await audioTest(url)}`);
    URL.revokeObjectURL(url);
  } catch (e: any) {
    L.push(`❌ Не удалось скачать целиком: ${e?.message ?? e}`);
  }
  return L.join("\n");
}

/** «Не играет? Диагностика»: показывает, что именно не так с файлом/сетью, и даёт скопировать отчёт. */
export function MusicDiagSheet({ open, onClose, track }: { open: boolean; onClose: () => void; track: MusicTrack | null }) {
  const { toast } = useToast();
  const [report, setReport] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !track) return;
    let dead = false;
    setReport(null);
    runMusicDiagnostics(track).then((r) => { if (!dead) setReport(r); }).catch((e) => { if (!dead) setReport(`Ошибка диагностики: ${e?.message ?? e}`); });
    return () => { dead = true; };
  }, [open, track]);
  return (
    <Sheet open={open} onClose={onClose} title="Диагностика музыки" full zIndex={80}>
      <div className="px-4 pb-8 flex flex-col gap-3 flex-1 min-h-0">
        {!report ? (
          <div className="flex flex-col items-center gap-3 py-10"><Spinner /><p className="mx-muted text-[14px]">Проверяю файл и сеть… до 30 секунд</p></div>
        ) : (
          <>
            <pre className="mx-card p-3 text-[12px] leading-relaxed whitespace-pre-wrap break-all mx-scroll" style={{ maxHeight: "58vh", overflow: "auto" }}>{report}</pre>
            <button className="mx-btn flex items-center justify-center gap-2" onClick={() => { navigator.clipboard?.writeText(report).then(() => toast("success", "Скопировано"), () => toast("error", "Не удалось скопировать")); }}><Copy size={17} />Скопировать отчёт</button>
            <p className="mx-muted text-[12.5px] text-center">Пришли этот отчёт разработчику — по нему видно, в чём причина.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

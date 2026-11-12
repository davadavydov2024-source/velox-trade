"use client";

import { useState } from "react";
import { Check, Upload, X } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { uploadMedia } from "@/lib/messenger/client";
import { compressAudio } from "@/lib/messenger/compressAudio";
import { makeCover, readId3 } from "@/lib/messenger/id3";
import { useToast } from "@/lib/toastContext";
import { Spinner } from "./ui";

interface Item { id: number; file: File; title: string; artist: string; status: "wait" | "work" | "ok" | "err"; note?: string }
const AUDIO_TYPE: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", wav: "audio/wav" };

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v: number) => { URL.revokeObjectURL(url); resolve(v); };
    const t = setTimeout(() => done(0), 5000);
    a.preload = "metadata";
    a.onloadedmetadata = () => { clearTimeout(t); done(Number.isFinite(a.duration) ? a.duration : 0); };
    a.onerror = () => { clearTimeout(t); done(0); };
    a.src = url;
  });
}

async function addTrack(body: unknown) {
  const res = await authedFetch("/api/admin/messenger/music", { method: "POST", body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Ошибка");
}

/** Массовая загрузка: выбираешь сразу много файлов — название, исполнитель и обложка берутся из тегов, песня сжимается, всё грузится по очереди. */
export function BulkMusicUpload({ existing, onDone }: { existing: { title: string; artist: string }[]; onDone: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [rights, setRights] = useState(false);
  const [compress, setCompress] = useState(true);
  const [running, setRunning] = useState(false);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => /\.(mp3|m4a|aac|ogg|wav)$/i.test(f.name) || f.type.startsWith("audio/")).slice(0, 40);
    const parsed: Item[] = [];
    for (const [i, f] of list.entries()) {
      const tags = await readId3(f);
      const base = f.name.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/_/g, " ").trim();
      const m = /^(.+?)\s[-–—]\s(.+)$/.exec(base);
      parsed.push({ id: Date.now() + i, file: f, title: tags.title || (m ? m[2].trim() : base), artist: tags.artist || (m ? m[1].trim() : ""), status: "wait" });
    }
    setItems(parsed);
  };

  const run = async () => {
    if (!rights || running) return;
    setRunning(true);
    const set = (id: number, p: Partial<Item>) => setItems((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)));
    let ok = 0;
    for (const it of items) {
      if (it.status === "ok") continue;
      const dup = existing.some((t) => t.title.toLowerCase() === it.title.toLowerCase() && t.artist.toLowerCase() === it.artist.toLowerCase());
      if (dup) { set(it.id, { status: "err", note: "Уже есть в каталоге" }); continue; }
      try {
        set(it.id, { status: "work", note: "Сжимаю…" });
        let up: File = it.file;
        if (compress && it.file.size > 1.5 * 1024 * 1024) {
          try { up = (await compressAudio(it.file, 128)).file; } catch (e) {
            if ((e as { name?: string })?.name === "EncodingError") throw new Error("Файл повреждён");
          }
        }
        if (up.size > 30 * 1024 * 1024) throw new Error("Больше 30 МБ");
        const ext = (up.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "mp3";
        const type = up.type && up.type.startsWith("audio/") ? up.type : AUDIO_TYPE[ext] ?? "audio/mpeg";
        set(it.id, { note: "Загружаю…" });
        const audioUrl = await uploadMedia(new File([up], up.name, { type }), "music", ext);
        const tags = await readId3(it.file);
        let cover: File | null = null;
        if (tags.cover && tags.cover.data.length < 4.5 * 1024 * 1024) {
          const ce = tags.cover.mime === "image/png" ? "png" : "jpg";
          cover = new File([tags.cover.data as BlobPart], `cover.${ce}`, { type: tags.cover.mime });
        } else cover = await makeCover(it.title, it.artist || "MiliGram");
        let coverUrl: string | undefined;
        if (cover) coverUrl = await uploadMedia(cover, "music-cover", cover.name.endsWith("png") ? "png" : "jpg");
        const duration = await readDuration(it.file);
        await addTrack({ action: "add", title: it.title, artist: it.artist, audioUrl, coverUrl, duration });
        set(it.id, { status: "ok", note: undefined });
        ok++;
      } catch (e: any) {
        set(it.id, { status: "err", note: e?.message || "Не удалось" });
      }
    }
    setRunning(false);
    toast(ok ? "success" : "error", ok ? `Добавлено песен: ${ok}` : "Ничего не добавлено");
    if (ok) onDone();
  };

  const edit = (id: number, p: Partial<Item>) => setItems((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <>
      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Массовая загрузка</p>
      <div className="px-4 flex flex-col gap-2.5">
        <label className="mx-card px-4 py-3 flex items-center gap-3 cursor-pointer">
          <Upload size={20} style={{ color: "var(--mx-accent)" }} />
          <span className="flex-1 min-w-0 text-[15px]">{items.length ? `Выбрано файлов: ${items.length}` : "Выбрать много mp3 сразу (до 40)"}</span>
          <input type="file" multiple disabled={running} accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </label>
        {items.map((it) => (
          <div key={it.id} className="mx-card px-3 py-2 flex items-center gap-2">
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <input className="mx-input" style={{ padding: "6px 10px" }} value={it.title} disabled={running || it.status === "ok"} maxLength={120} onChange={(e) => edit(it.id, { title: e.target.value })} aria-label="Название" />
              <input className="mx-input" style={{ padding: "6px 10px" }} value={it.artist} disabled={running || it.status === "ok"} maxLength={120} placeholder="Исполнитель" onChange={(e) => edit(it.id, { artist: e.target.value })} aria-label="Исполнитель" />
              <span className="mx-muted text-[12px] truncate" style={it.status === "err" ? { color: "var(--mx-danger)" } : undefined}>{it.file.name} · {(it.file.size / 1048576).toFixed(1)} МБ{it.note ? ` · ${it.note}` : ""}</span>
            </div>
            <span className="w-7 flex justify-center shrink-0">
              {it.status === "work" ? <Spinner size={18} /> : it.status === "ok" ? <Check size={20} style={{ color: "var(--mx-accent)" }} /> : it.status === "err" ? <X size={20} style={{ color: "var(--mx-danger)" }} /> : null}
            </span>
          </div>
        ))}
        {items.length > 0 && (
          <>
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} /> Сжимать до 128 кбит/с</label>
            <label className="flex items-start gap-2 text-[14px]"><input type="checkbox" className="mt-1" checked={rights} onChange={(e) => setRights(e.target.checked)} /> Это моя музыка или у меня есть права на её использование</label>
            <button className="mx-btn" disabled={!rights || running || items.every((i) => i.status === "ok")} onClick={run}>{running ? <span className="flex items-center justify-center gap-2"><Spinner size={18} />Загружаю…</span> : `Загрузить все (${items.filter((i) => i.status !== "ok").length})`}</button>
            <p className="mx-muted text-[12px]">Название, исполнитель и обложка берутся из тегов mp3 (можно поправить выше). Если обложки в файле нет, рисуется простая с названием.</p>
          </>
        )}
      </div>
    </>
  );
}

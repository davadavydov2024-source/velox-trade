"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Music2, Pencil, Trash2, Upload, X } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { uploadMedia } from "@/lib/messenger/client";
import { compressAudio } from "@/lib/messenger/compressAudio";
import { useToast } from "@/lib/toastContext";
import type { MusicRequest, MusicTrack } from "@/lib/messenger/music";
import { Spinner } from "./ui";
import { fmtTime, TrackCover } from "./MusicPlayer";

type AdminRequest = MusicRequest & { userName?: string };

async function call<T = any>(body?: unknown): Promise<T> {
  const res = await authedFetch("/api/admin/messenger/music", body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Ошибка");
  return d as T;
}

/** Длительность аудиофайла до загрузки (секунды); 0, если браузер не смог прочитать. */
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

const AUDIO_TYPE: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", wav: "audio/wav" };

/** Вкладка «Музыка» в админ-панели: заявки пользователей, загрузка mp3, каталог. */
export function AdminMusic() {
  const { toast } = useToast();
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [fileNote, setFileNote] = useState<{ text: string; warn: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await call<{ tracks: MusicTrack[]; requests: AdminRequest[] }>();
      setTracks(d.tracks);
      setRequests(d.requests);
    } catch (e: any) { toast("error", e.message); setTracks([]); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const pickFile = (f: File | null) => {
    setFile(f);
    setFileNote(null);
    if (f) {
      // оцениваем «вес» песни: тяжёлые mp3 долго грузятся на мобильном интернете
      readDuration(f).then((d) => {
        const mb = f.size / 1048576;
        const kbps = d > 0 ? Math.round((f.size * 8) / d / 1000) : 0;
        const heavy = mb > 8 || kbps > 200;
        setFileNote({ text: `${mb.toFixed(1)} МБ${d > 0 ? ` · ${fmtTime(d)} · ~${kbps} кбит/с` : ""}${heavy ? ". Тяжеловат: на слабом интернете будет грузиться долго. Лучше перекодировать в 128 кбит/с (≈3–4 МБ на песню)." : ". Размер нормальный."}`, warn: heavy });
      });
    }
    if (f && !title.trim()) {
      // «Исполнитель - Название.mp3» → подставляем в поля
      const base = f.name.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/_/g, " ");
      const m = /^(.+?)\s[-–—]\s(.+)$/.exec(base);
      if (m) { setArtist((a) => a || m[1].trim()); setTitle(m[2].trim()); } else setTitle(base.trim());
    }
  };

  const fromRequest = (r: AdminRequest) => {
    setRequestId(r.id);
    const m = /^(.+?)\s[-–—]\s(.+)$/.exec(r.text);
    if (m) { setArtist(m[1].trim()); setTitle(m[2].trim()); } else { setArtist(""); setTitle(r.text); }
    window.scrollTo?.({ top: 0 });
    toast("info", "Выбери mp3-файл и нажми «Добавить»");
  };

  const [autoQ, setAutoQ] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoRu, setAutoRu] = useState(false);
  const [cands, setCands] = useState<{ id: string; title: string; artist: string; duration: number; license: string; image: string; source?: string }[]>([]);
  const autoAdd = async (body: Record<string, unknown>) => {
    setAutoBusy(true);
    try {
      const res = await authedFetch("/api/admin/messenger/music-auto", { method: "POST", body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Ошибка");
      if (d.added) { toast("success", `Добавлено: ${d.added.artist} — ${d.added.title} (${d.added.license})`); setCands([]); setAutoQ(""); load(); }
      else if (d.candidates) { setCands(d.candidates); toast("info", "Выбери подходящий вариант"); }
    } catch (e: any) { setCands([]); toast("error", e.message); }
    setAutoBusy(false);
  };
  const [compress, setCompress] = useState(true);
  const [kbps, setKbps] = useState(128);

  const submit = async () => {
    if (!file || !title.trim() || busy) return;
    let up: File = file;
    // «Сжать»: перекодируем в mp3 с выбранным битрейтом прямо в браузере (при сбое грузим оригинал)
    if (compress && file.size > 1.5 * 1024 * 1024) {
      try {
        setBusy("Сжимаю песню… 0%");
        const r = await compressAudio(file, kbps, (p) => setBusy(`Сжимаю песню… ${Math.round(p * 100)}%`));
        up = r.file;
        if (r.compressed) toast("success", `Сжато: ${(r.before / 1048576).toFixed(1)} → ${(r.after / 1048576).toFixed(1)} МБ`);
        else toast("info", "Файл уже лёгкий — загружаю как есть");
      } catch (e) {
        console.error("compress failed:", e);
        const broken = (e as { name?: string })?.name === "EncodingError" || /decode/i.test(String((e as Error)?.message));
        if (broken) { // браузер не смог расшифровать файл — значит, он повреждён: такой трек всё равно не заиграет, не загружаем
          toast("error", "Файл повреждён или это не настоящий mp3 — браузер не смог его прочитать. Скачай песню заново и попробуй ещё раз.");
          setBusy("");
          return;
        }
        toast("error", "Не удалось сжать — загружаю оригинал");
        up = file;
      }
    }
    const ext = (up.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "mp3";
    const type = up.type && up.type.startsWith("audio/") ? up.type : AUDIO_TYPE[ext] ?? "audio/mpeg";
    if (up.size > 30 * 1024 * 1024) { toast("error", "Файл больше 30 МБ даже после сжатия — включи сжатие или выбери битрейт пониже"); setBusy(""); return; }
    try {
      setBusy("Загружаю песню…");
      const audioUrl = await uploadMedia(new File([up], up.name, { type }), "music", ext);
      let coverUrl: string | undefined;
      if (cover) {
        setBusy("Загружаю обложку…");
        const cext = (cover.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "jpg";
        coverUrl = await uploadMedia(cover, "music-cover", cext);
      }
      const duration = await readDuration(file);
      setBusy("Сохраняю…");
      await call({ action: "add", title, artist, audioUrl, coverUrl, duration, requestId: requestId ?? undefined });
      toast("success", requestId ? "Песня добавлена, автору заявки отправлено уведомление" : "Песня добавлена");
      setTitle(""); setArtist(""); setFile(null); setCover(null); setRequestId(null);
      load();
    } catch (e: any) {
      toast("error", e?.message || "Не удалось загрузить");
    } finally { setBusy(""); }
  };

  const reject = async (r: AdminRequest) => {
    const note = window.prompt("Причина отказа (необязательно, увидит автор заявки):") ?? null;
    if (note === null) return;
    try { await call({ action: "reject", requestId: r.id, note }); toast("success", "Заявка отклонена"); load(); } catch (e: any) { toast("error", e.message); }
  };
  const [lyricsFor, setLyricsFor] = useState<MusicTrack | null>(null);
  const [lyricsText, setLyricsText] = useState("");
  const saveLyrics = async () => {
    if (!lyricsFor) return;
    try { await call({ action: "lyrics", id: lyricsFor.id, lyrics: lyricsText }); toast("success", "Текст сохранён"); setLyricsFor(null); load(); } catch (e: any) { toast("error", e.message); }
  };
  const edit = async (t: MusicTrack) => {
    const nt = window.prompt("Название:", t.title);
    if (!nt) return;
    const na = window.prompt("Исполнитель:", t.artist) ?? t.artist;
    try { await call({ action: "edit", id: t.id, title: nt, artist: na }); load(); } catch (e: any) { toast("error", e.message); }
  };
  const del = async (t: MusicTrack) => {
    if (!confirm(`Удалить «${t.title}»? Файл тоже удалится.`)) return;
    try { await call({ action: "delete", id: t.id }); toast("success", "Удалено"); load(); } catch (e: any) { toast("error", e.message); }
  };

  const lyricsModal = lyricsFor && (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setLyricsFor(null)}>
      <div className="w-full max-w-[520px] rounded-2xl p-4 flex flex-col gap-3" style={{ background: "var(--mx-bg)", color: "var(--mx-text)" }} onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold truncate">Текст: {lyricsFor.artist} — {lyricsFor.title}</p>
        <textarea className="mx-input" rows={12} maxLength={8000} value={lyricsText} onChange={(e) => setLyricsText(e.target.value)} placeholder="Вставь текст песни. Только если у тебя есть права на него или артист разрешил." />
        <div className="flex gap-2 justify-end">
          <button className="px-4 py-2 rounded-xl mx-muted" onClick={() => setLyricsFor(null)}>Отмена</button>
          <button className="px-4 py-2 rounded-xl font-medium" style={{ background: "var(--mx-accent)", color: "#fff" }} onClick={saveLyrics}>Сохранить</button>
        </div>
      </div>
    </div>
  );

  const fresh = requests.filter((r) => r.status === "new");
  return (
    <div className="pb-10">
      {lyricsModal}
      <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Заявки на песни{fresh.length ? ` · ${fresh.length}` : ""}</p>
      {requests.length === 0 ? <p className="mx-muted px-4 py-3 text-[14px]">Заявок пока нет</p> : requests.slice(0, 40).map((r) => (
        <div key={r.id} className="px-4 py-2.5 flex items-center gap-3" style={{ opacity: r.status === "new" ? 1 : 0.6 }}>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] truncate">{r.text}</p>
            <p className="mx-muted text-[12.5px] truncate">{r.userName} · {new Date(r.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{r.status !== "new" ? ` · ${r.status === "added" ? "добавлена" : "отклонена"}` : ""}</p>
          </div>
          {r.status === "new" && (
            <>
              <button className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--mx-accent)", color: "#fff" }} onClick={() => fromRequest(r)} aria-label="Добавить"><Check size={18} /></button>
              <button className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--mx-surface)", color: "var(--mx-danger)" }} onClick={() => reject(r)} aria-label="Отклонить"><X size={18} /></button>
            </>
          )}
        </div>
      ))}

      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Автодобавление (свободная музыка)</p>
      <div className="px-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <input className="mx-input flex-1" placeholder="Артист — название" value={autoQ} onChange={(e) => setAutoQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && autoQ.trim().length > 1 && !autoBusy) autoAdd({ q: autoQ, ru: autoRu }); }} />
          <button className="px-4 rounded-xl text-[14px] font-medium" disabled={autoBusy || (autoQ.trim().length < 2 && !autoRu)} style={{ background: "var(--mx-accent)", color: "#fff", opacity: autoBusy || (autoQ.trim().length < 2 && !autoRu) ? 0.5 : 1 }} onClick={() => autoAdd({ q: autoQ, ru: autoRu })}>{autoBusy ? <Spinner /> : "Найти"}</button>
        </div>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={autoRu} onChange={(e) => setAutoRu(e.target.checked)} /> Только русскоязычные</label>
        {autoRu && !autoQ.trim() && <button className="text-left text-[14px] underline" style={{ color: "var(--mx-accent)" }} disabled={autoBusy} onClick={() => autoAdd({ q: "", ru: true })}>Показать популярные русские песни</button>}
        <p className="mx-muted text-[12px]">Ищет в Jamendo, Internet Archive, Openverse, ccMixter и Wikimedia Commons только среди треков с лицензиями CC BY / BY-SA / CC0 и сам добавляет точное совпадение. Популярных коммерческих песен там нет.</p>
        {cands.map((c) => (
          <button key={c.id} disabled={autoBusy} className="flex items-center gap-3 text-left py-1.5" onClick={() => autoAdd({ pickId: c.id })}>
            <span className="min-w-0 flex-1"><span className="block text-[15px] truncate">{c.title}</span><span className="block mx-muted text-[12.5px] truncate">{c.artist} · {c.license}{c.source ? ` · ${c.source}` : ""}{c.duration ? ` · ${fmtTime(c.duration)}` : ""}</span></span>
            <span className="text-[13px]" style={{ color: "var(--mx-accent)" }}>Добавить</span>
          </button>
        ))}
      </div>

      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Добавить песню</p>
      <div className="px-4 flex flex-col gap-2.5">
        {requestId && <p className="text-[13px]" style={{ color: "var(--mx-accent)" }}>Добавляешь по заявке — автор получит уведомление. <button className="underline" onClick={() => setRequestId(null)}>отвязать</button></p>}
        <input className="mx-input" placeholder="Название песни" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <input className="mx-input" placeholder="Исполнитель" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={120} />
        <label className="mx-card px-4 py-3 flex items-center gap-3 cursor-pointer">
          <Upload size={20} style={{ color: "var(--mx-accent)" }} />
          <span className="flex-1 min-w-0 text-[15px] truncate">{file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} МБ` : "Выбрать mp3-файл (до 30 МБ после сжатия)"}</span>
          <input type="file" accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.aac,.ogg,.wav" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="mx-card px-4 py-3 flex items-center gap-3">
          <span className="flex-1 min-w-0">
            <span className="block text-[15px]">Сжать песню (mp3)</span>
            <span className="block mx-muted text-[12.5px]">Перекодирует в браузере — файл станет в 2–3 раза легче, грузится и играет быстрее</span>
          </span>
          {compress && (
            <select className="mx-input" style={{ width: 96, padding: "6px 8px" }} value={kbps} onChange={(e) => setKbps(Number(e.target.value))} aria-label="Битрейт">
              <option value={96}>96 kbps</option><option value={128}>128 kbps</option><option value={160}>160 kbps</option><option value={192}>192 kbps</option>
            </select>
          )}
          <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--mx-accent)" }} aria-label="Сжимать" />
        </div>
        {fileNote && <p className="text-[12.5px] -mt-1 px-1" style={{ color: fileNote.warn ? "#ff9f0a" : "var(--mx-muted)" }}>{fileNote.text}</p>}
        <label className="mx-card px-4 py-3 flex items-center gap-3 cursor-pointer">
          <Music2 size={20} className="mx-muted" />
          <span className="flex-1 min-w-0 text-[15px] truncate">{cover ? cover.name : "Обложка (необязательно)"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
        </label>
        <button className="mx-btn" onClick={submit} disabled={!file || !title.trim() || !!busy}>{busy ? <span className="flex items-center justify-center gap-2"><Spinner size={18} />{busy}</span> : "Добавить в Музыку"}</button>
        <p className="mx-muted text-[12px]">Загружай только то, на что у тебя есть права: за авторские права на музыку отвечает владелец сервиса.</p>
      </div>

      <p className="px-4 pt-6 pb-1 text-[13px] uppercase tracking-wide mx-muted">Каталог{tracks ? ` · ${tracks.length}` : ""}</p>
      {tracks === null ? <div className="flex justify-center py-6"><Spinner /></div> : tracks.length === 0 ? <p className="mx-muted px-4 py-3 text-[14px]">Пока пусто</p> : tracks.map((t) => (
        <div key={t.id} className="px-4 py-2 flex items-center gap-3">
          <TrackCover track={t} size={44} radius={9} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] truncate">{t.title}</p>
            <p className="mx-muted text-[12.5px] truncate">{t.artist}{t.duration ? ` · ${fmtTime(t.duration)}` : ""} · ▶ {t.plays ?? 0}</p>
          </div>
          <button className="w-9 h-9 flex items-center justify-center mx-muted text-[12px] font-semibold" style={t.lyrics ? { color: "var(--mx-accent)" } : undefined} onClick={() => { setLyricsFor(t); setLyricsText(t.lyrics ?? ""); }} aria-label="Текст песни">Aa</button>
          <button className="w-9 h-9 flex items-center justify-center mx-muted" onClick={() => edit(t)} aria-label="Изменить"><Pencil size={17} /></button>
          <button className="w-9 h-9 flex items-center justify-center" style={{ color: "var(--mx-danger)" }} onClick={() => del(t)} aria-label="Удалить"><Trash2 size={17} /></button>
        </div>
      ))}
    </div>
  );
}

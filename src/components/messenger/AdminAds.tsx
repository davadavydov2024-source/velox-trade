"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Pause, Play, Pencil, Trash2 } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { uploadMedia } from "@/lib/messenger/client";
import { AD_LIMITS, type MessengerAd } from "@/lib/messenger/ads";
import { useToast } from "@/lib/toastContext";
import { Spinner } from "./ui";
import { AdCard } from "./SponsoredAd";

async function call<T = any>(body?: unknown): Promise<T> {
  const res = await authedFetch("/api/admin/messenger/ads", body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Ошибка");
  return d as T;
}

const EMPTY = { title: "", text: "", buttonText: "Открыть", buttonUrl: "https://", mediaUrl: "", mediaKind: "image" as "image" | "video", channel: true, viewer: true, days: 0 };

/** Админка рекламы: объявление = фото или видео + текст + кнопка со ссылкой. Показывается внизу каналов и/или при просмотре фото. */
export function AdminAds() {
  const { toast } = useToast();
  const [ads, setAds] = useState<MessengerAd[] | null>(null);
  const [f, setF] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setAds((await call<{ ads: MessengerAd[] }>()).ads); } catch (e: any) { toast("error", e.message); setAds([]); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const video = file.type.startsWith("video/");
    if (!video && !file.type.startsWith("image/")) return toast("error", "Нужно фото или видео");
    if (video && file.size > 25 * 1048576) return toast("error", "Видео больше 25 МБ");
    setUp(true);
    try {
      if (!video && file.size > 10 * 1048576) throw new Error("Фото больше 10 МБ");
      const blob: Blob = file;
      const ext = video ? (file.type.includes("webm") ? "webm" : "mp4") : blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : blob.type.includes("gif") ? "gif" : "jpg";
      const url = await uploadMedia(blob, video ? "story-video" : "story-image", ext);
      setF((x) => ({ ...x, mediaUrl: url, mediaKind: video ? "video" : "image" }));
    } catch (e: any) { toast("error", e?.message || "Не удалось загрузить"); } finally { setUp(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const body = { title: f.title, text: f.text, buttonText: f.buttonText, buttonUrl: f.buttonUrl, mediaUrl: f.mediaUrl, mediaKind: f.mediaKind, channel: f.channel, viewer: f.viewer, endsAt: f.days > 0 ? Date.now() + f.days * 86400_000 : 0 };
      await call(editId ? { action: "edit", id: editId, ...body } : { action: "add", ...body });
      toast("success", editId ? "Объявление обновлено" : "Реклама запущена");
      setF(EMPTY); setEditId(null); await load();
    } catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  const toggle = async (a: MessengerAd) => { try { await call({ action: "toggle", id: a.id, active: !a.active }); await load(); } catch (e: any) { toast("error", e.message); } };
  const del = async (a: MessengerAd) => { if (!confirm(`Удалить рекламу «${a.title}»? Статистика тоже удалится.`)) return; try { await call({ action: "delete", id: a.id }); await load(); } catch (e: any) { toast("error", e.message); } };
  const edit = (a: MessengerAd) => { setEditId(a.id); setF({ title: a.title, text: a.text, buttonText: a.buttonText, buttonUrl: a.buttonUrl, mediaUrl: a.mediaUrl, mediaKind: a.mediaKind, channel: a.channel, viewer: a.viewer, days: 0 }); window.scrollTo?.({ top: 0 }); };

  const ready = !!f.mediaUrl && !!f.title.trim() && !!f.buttonText.trim() && /^https:\/\/.+\..+/.test(f.buttonUrl) && (f.channel || f.viewer);

  return (
    <>
      <p className="px-4 pt-3 pb-2 text-[13px] uppercase tracking-wide mx-muted">{editId ? "Изменить рекламу" : "Новая реклама"}</p>
      <div className="px-4 flex flex-col gap-2.5">
        <div className="mx-card px-4 py-3 flex flex-col gap-2.5">
          <button className="mx-btn flex items-center justify-center gap-2" disabled={up} onClick={() => fileRef.current?.click()}>{up ? <Spinner size={18} /> : <ImagePlus size={18} />}{f.mediaUrl ? "Заменить фото / видео" : "Загрузить фото или видео"}</button>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <input className="mx-input" placeholder="Заголовок (кто рекламирует)" maxLength={AD_LIMITS.title} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea className="mx-input" rows={3} placeholder="Текст рекламы" maxLength={AD_LIMITS.text} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
          <div className="flex gap-2">
            <input className="mx-input" style={{ width: "40%" }} placeholder="Кнопка" maxLength={AD_LIMITS.button} value={f.buttonText} onChange={(e) => setF({ ...f, buttonText: e.target.value })} />
            <input className="mx-input flex-1" placeholder="https://ссылка" inputMode="url" maxLength={AD_LIMITS.url} value={f.buttonUrl} onChange={(e) => setF({ ...f, buttonUrl: e.target.value.trim() })} />
          </div>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.channel} onChange={(e) => setF({ ...f, channel: e.target.checked })} /> Показывать внизу каналов</label>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.viewer} onChange={(e) => setF({ ...f, viewer: e.target.checked })} /> Показывать при просмотре фото</label>
          <label className="flex items-center gap-2 text-[14px]">Показывать дней:
            <select className="mx-input" style={{ padding: "6px 10px", width: "auto" }} value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>
              <option value={0}>без ограничения</option><option value={1}>1</option><option value={3}>3</option><option value={7}>7</option><option value={14}>14</option><option value={30}>30</option>
            </select>
          </label>
          {f.mediaUrl && <><p className="mx-muted text-[12.5px]">Так увидят в канале:</p><AdCard preview ad={{ id: "preview", title: f.title || "Заголовок", text: f.text, mediaUrl: f.mediaUrl, mediaKind: f.mediaKind, buttonText: f.buttonText || "Открыть", buttonUrl: f.buttonUrl }} /></>}
          <div className="flex gap-2">
            <button className="mx-btn flex-1" disabled={!ready || busy} onClick={save}>{busy ? <Spinner size={18} /> : editId ? "Сохранить" : "Запустить рекламу"}</button>
            {editId && <button className="mx-btn" style={{ width: "auto", padding: "0 16px", background: "var(--mx-surface)", color: "var(--mx-text)" }} onClick={() => { setEditId(null); setF(EMPTY); }}>Отмена</button>}
          </div>
          <p className="mx-muted text-[12px]">Реклама всегда подписана «Реклама». Подписчикам Mili Premium она не показывается.</p>
        </div>
      </div>

      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Кампании</p>
      <div className="px-4 flex flex-col gap-2.5 pb-6">
        {ads === null ? <div className="flex justify-center py-4"><Spinner size={22} /></div> : ads.length === 0 ? <p className="mx-muted text-[14px]">Пока нет рекламы.</p> : ads.map((a) => {
          const ctr = a.views ? ((a.clicks / a.views) * 100).toFixed(1) : "0";
          const ended = !!a.endsAt && a.endsAt < Date.now();
          return (
            <div key={a.id} className="mx-card px-3 py-2.5 flex items-center gap-3" style={{ opacity: a.active && !ended ? 1 : 0.6 }}>
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black">
                {a.mediaKind === "video"
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  ? <video src={a.mediaUrl} muted playsInline className="w-full h-full object-cover" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={a.mediaUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium truncate">{a.title}</p>
                <p className="text-[12.5px] mx-muted">👁 {a.views} · 👆 {a.clicks} · CTR {ctr}%</p>
                <p className="text-[12px] mx-muted truncate">{[a.channel && "каналы", a.viewer && "просмотр фото"].filter(Boolean).join(", ")}{a.endsAt ? ` · до ${new Date(a.endsAt).toLocaleDateString("ru-RU")}` : ""}{ended ? " · закончилась" : !a.active ? " · на паузе" : ""}</p>
              </div>
              <button onClick={() => toggle(a)} className="w-8 h-8 flex items-center justify-center mx-muted" aria-label={a.active ? "Пауза" : "Запустить"}>{a.active ? <Pause size={18} /> : <Play size={18} />}</button>
              <button onClick={() => edit(a)} className="w-8 h-8 flex items-center justify-center mx-muted" aria-label="Изменить"><Pencil size={17} /></button>
              <button onClick={() => del(a)} className="w-8 h-8 flex items-center justify-center" style={{ color: "var(--mx-danger)" }} aria-label="Удалить"><Trash2 size={17} /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}

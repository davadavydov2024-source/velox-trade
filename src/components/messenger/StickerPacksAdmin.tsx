"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Star, Trash2, Upload } from "lucide-react";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import type { MessengerSticker, MessengerStickerPack } from "@/lib/messenger/types";
import { Sheet, Spinner } from "./ui";
import { StickerMedia } from "./StickerMedia";
import { ImportBox } from "./StickersUI";

type Draft = { slug: string; isNew: boolean; title: string; premium: boolean; published: boolean; stickers: MessengerSticker[] };
const newSlug = () => "pack_" + Math.random().toString(36).slice(2, 10);

/**
 * Управление стикерпаками «как в Telegram» — ТОЛЬКО для админа (сервер проверяет права на каждый запрос).
 * Создать набор, загрузить стикеры (PNG / WEBP / GIF / WEBM / TGS), поменять порядок и эмодзи, выбрать обложку,
 * опубликовать для всех (каталог в Настройки → Стикеры) или удалить. Готовые наборы можно привезти из Telegram.
 */
export function StickerPacksAdmin() {
  const { toast } = useToast();
  const [packs, setPacks] = useState<MessengerStickerPack[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/admin/messenger/stickers");
      const d = await res.json();
      setPacks(res.ok ? d.packs : []);
    } catch {
      setPacks([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const move = (from: number, to: number) => {
    if (!draft) return;
    const arr = [...draft.stickers];
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    patch({ stickers: arr });
  };
  const setEmoji = (i: number, emoji: string) => draft && patch({ stickers: draft.stickers.map((s, j) => (j === i ? { ...s, emoji } : s)) });
  const removeSticker = (i: number) => draft && patch({ stickers: draft.stickers.filter((_, j) => j !== i) });

  async function uploadFiles(files: FileList | null) {
    if (!draft || !files?.length) return;
    setUploading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const added: MessengerSticker[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("slug", draft.slug);
        const res = await fetch("/api/admin/messenger/stickers/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(`${file.name}: ${d.error}`);
        added.push({ url: d.url, emoji: "🙂", ...(d.kind ? { kind: d.kind } : {}) });
      }
      setDraft((cur) => (cur ? { ...cur, stickers: [...cur.stickers, ...added].slice(0, 120) } : cur));
    } catch (e: any) {
      toast("error", e?.message || "Не удалось загрузить");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await authedFetch("/api/admin/messenger/stickers", {
        method: "POST",
        body: JSON.stringify({ action: "save", slug: draft.slug, title: draft.title, premium: draft.premium, published: draft.published, stickers: draft.stickers }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast("success", "Набор сохранён");
      setDraft(null);
      await load();
    } catch (e: any) {
      toast("error", e?.message || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function removePack() {
    if (!draft || !confirm(`Удалить набор «${draft.title || draft.slug}»? Он пропадёт у всех пользователей.`)) return;
    setBusy(true);
    try {
      const res = await authedFetch("/api/admin/messenger/stickers", { method: "POST", body: JSON.stringify({ action: "delete", slug: draft.slug }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast("success", "Набор удалён");
      setDraft(null);
      await load();
    } catch (e: any) {
      toast("error", e?.message || "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="mx-card p-4 space-y-3">
        <p className="font-semibold">Стикерпаки <span className="mx-muted font-normal">· {packs?.length ?? "…"}</span></p>
        <p className="mx-muted text-[13.5px]">Как в Telegram: создавай наборы, загружай стикеры (PNG, WEBP, GIF, WEBM, TGS) или привози готовые из Telegram — анимированные играют сами. Управлять наборами может только администратор.</p>
        <button className="mx-btn w-full flex items-center justify-center gap-2" onClick={() => setDraft({ slug: newSlug(), isNew: true, title: "", premium: false, published: false, stickers: [] })}>
          <Plus size={18} /> Новый набор
        </button>
      </div>

      <div className="mx-card p-4 space-y-2">
        <p className="font-semibold">Привезти из Telegram</p>
        <ImportBox onDone={load} />
      </div>

      <div className="mx-card">
        {packs === null ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : packs.length === 0 ? (
          <p className="mx-muted text-center text-[14px] py-5">Наборов пока нет</p>
        ) : (
          packs.map((p) => (
            <button key={p.slug} onClick={() => setDraft({ slug: p.slug, isNew: false, title: p.title, premium: p.premium, published: p.published, stickers: p.stickers })} className="w-full text-left flex items-center gap-3 px-4 py-3">
              {p.stickers[0] ? <StickerMedia url={p.stickers[0].url} preview={p.stickers[0].preview} kind={p.stickers[0].kind} size={48} animate={false} emoji={p.stickers[0].emoji} className="shrink-0 rounded-xl" /> : <span className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center" style={{ background: "var(--mx-surface2)" }}>🧩</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.title}</p>
                <p className="mx-muted text-[12.5px]">
                  {p.stickers.length} шт{p.tgName ? " · из Telegram" : ""}{p.premium ? " · Premium" : ""}{p.published ? "" : " · черновик"}
                </p>
              </div>
              <span className="mx-muted text-[13px]">Изменить</span>
            </button>
          ))
        )}
      </div>

      <Sheet open={!!draft} onClose={() => !busy && setDraft(null)} title={draft?.isNew ? "Новый набор" : "Набор стикеров"} full zIndex={95}>
        {draft && (
          <div className="p-4 space-y-3 pb-10">
            <input className="mx-input w-full" placeholder="Название набора" maxLength={40} value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
            <div className="flex gap-4 flex-wrap text-[14.5px]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.premium} onChange={(e) => patch({ premium: e.target.checked })} /> Только Mili Premium</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.published} onChange={(e) => patch({ published: e.target.checked })} /> Опубликован (виден всем)</label>
            </div>
            <p className="mx-muted text-[12.5px]">Ссылка на набор: /m?stickers={draft.slug}</p>

            <button className="mx-btn mx-btn-ghost w-full flex items-center justify-center gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Spinner /> : <Upload size={18} />} Добавить стикеры
            </button>
            <input ref={fileRef} type="file" multiple hidden accept="image/png,image/webp,image/gif,video/webm,.tgs" onChange={(e) => uploadFiles(e.target.files)} />

            {draft.stickers.length === 0 ? (
              <p className="mx-muted text-center text-[14px] py-4">Пока пусто — добавь стикеры кнопкой выше</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {draft.stickers.map((s, i) => (
                  <div key={s.url} className="rounded-2xl p-2 space-y-1.5" style={{ background: "var(--mx-surface)" }}>
                    <StickerMedia url={s.url} preview={s.preview} kind={s.kind} size="100%" style={{ height: "auto", aspectRatio: "1 / 1" }} emoji={s.emoji} />
                    <input className="mx-input w-full text-center" style={{ padding: "4px 6px" }} maxLength={8} value={s.emoji} onChange={(e) => setEmoji(i, e.target.value)} aria-label="Эмодзи стикера" />
                    <div className="flex items-center justify-between px-0.5">
                      <button disabled={i === 0} onClick={() => move(i, i - 1)} className="p-1 disabled:opacity-30" aria-label="Левее"><ArrowLeft size={16} /></button>
                      <button onClick={() => move(i, 0)} className="p-1" aria-label="Сделать обложкой" title="Обложка набора"><Star size={15} /></button>
                      <button disabled={i === draft.stickers.length - 1} onClick={() => move(i, i + 1)} className="p-1 disabled:opacity-30" aria-label="Правее"><ArrowRight size={16} /></button>
                      <button onClick={() => removeSticker(i)} className="p-1" aria-label="Убрать стикер"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button className="mx-btn w-full" disabled={busy || uploading} onClick={save}>{busy ? "Сохраняю…" : "Сохранить набор"}</button>
            {!draft.isNew && <button className="mx-btn mx-btn-ghost w-full" disabled={busy} onClick={removePack}>Удалить набор</button>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

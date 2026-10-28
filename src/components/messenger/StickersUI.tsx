"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Lock, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import type { MessengerStickerPack } from "@/lib/messenger/types";
import { mApi, MApiError } from "./api";
import { Spinner } from "./ui";

export type StickerPack = MessengerStickerPack & { locked?: boolean; added?: boolean };

let cache: StickerPack[] | null = null;

/** Мои наборы стикеров (общий кэш на вкладку: панель в чате и страница настроек видят одно и то же). */
export function useStickerPacks() {
  const [packs, setPacks] = useState<StickerPack[] | null>(cache);
  const reload = useCallback(() => {
    mApi<{ packs: StickerPack[] }>("stickers").then((d) => { cache = d.packs; setPacks(d.packs); }).catch(() => setPacks((p) => p ?? []));
  }, []);
  useEffect(reload, [reload]);
  return { packs, reload };
}

/** Импорт набора из Telegram — ТОЛЬКО для админ-панели (сервер отклоняет остальных). Набор публикуется в каталоге для всех. */
export function ImportBox({ onDone }: { onDone?: () => void }) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [premium, setPremium] = useState(false);
  const run = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const r = await mApi<{ title: string; count: number; reused?: boolean; skipped?: number }>("stickers", { action: "import", url, premium });
      toast("success", `«${r.title}» опубликован: ${r.count} стикеров${r.skipped ? ` (${r.skipped} пропущено)` : ""}`);
      setUrl("");
      onDone?.();
    } catch (e) {
      toast("error", e instanceof MApiError ? e.message : "Не удалось скачать набор");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="px-1">
      <div className="flex gap-2">
        <input className="mx-input flex-1" placeholder="t.me/addstickers/…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} autoCapitalize="none" autoCorrect="off" inputMode="url" />
        <button className="mx-btn px-4 shrink-0" onClick={run} disabled={busy || !url.trim()}>{busy ? <Spinner size={18} /> : <Download size={18} />}</button>
      </div>
      <label className="flex items-center gap-2 mt-2 px-1 text-[14px]"><input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} /> Только для Mili Premium</label>
      <p className="mx-muted text-[12.5px] mt-1.5 px-1">Вставь ссылку на стикерпак из Telegram. Набор появится в каталоге у всех пользователей (Настройки → Стикеры). Анимированные сохраняются картинкой.</p>
    </div>
  );
}

/** Страница «Стикеры» в настройках. */
export function StickersSettings() {
  const { toast } = useToast();
  const { packs, reload } = useStickerPacks();
  const [catalog, setCatalog] = useState<StickerPack[] | null>(null);
  const loadCatalog = useCallback(() => {
    mApi<{ packs: StickerPack[] }>("stickers?catalog=1").then((d) => setCatalog(d.packs)).catch(() => setCatalog([]));
  }, []);
  useEffect(loadCatalog, [loadCatalog]);
  const add = async (p: StickerPack) => {
    try {
      await mApi("stickers", { slug: p.slug, action: "add" });
      toast("success", `«${p.title}» добавлен`);
      reload();
      loadCatalog();
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось добавить"); }
  };
  const remove = async (p: StickerPack) => {
    if (!confirm(`Убрать набор «${p.title}»?`)) return;
    try { await mApi("stickers", { slug: p.slug, action: "remove" }); reload(); loadCatalog(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };
  return (
    <div className="space-y-4">
      {packs === null ? <div className="flex justify-center py-6"><Spinner /></div> : packs.length === 0 ? (
        <p className="mx-muted text-center text-[14px] py-4">Своих наборов пока нет. Добавь любой из каталога ниже — стикеры появятся в поле ввода.</p>
      ) : (
        <div className="mx-card">
          {packs.map((p) => (
            <div key={p.slug} className="flex items-center gap-3 px-4 py-3">
              <div className="flex -space-x-2 shrink-0">
                {p.stickers.slice(0, 3).map((s, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={s.url} alt="" className="w-11 h-11 object-contain rounded-xl" style={{ background: "var(--mx-surface2)" }} />)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold flex items-center gap-1.5">{p.title}{p.premium && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,180,0,.16)", color: "#ffb400" }}>Premium</span>}</p>
                <p className="mx-muted text-[13px]">{p.stickers.length} стикеров{p.locked ? " · нужен Premium" : ""}</p>
              </div>
              <button className="p-2 mx-muted" onClick={() => remove(p)} aria-label="Убрать"><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      )}

      <p className="px-4 pt-2 text-[13px] uppercase tracking-wide mx-muted">Каталог</p>
      {catalog === null ? <div className="flex justify-center py-4"><Spinner /></div> : catalog.filter((p) => !p.added).length === 0 ? (
        <p className="mx-muted text-center text-[14px] py-2">{catalog.length === 0 ? "Администрация пока не добавила наборы" : "Вы добавили все доступные наборы 🎉"}</p>
      ) : (
        <div className="mx-card">
          {catalog.filter((p) => !p.added).map((p) => (
            <div key={p.slug} className="flex items-center gap-3 px-4 py-3">
              <div className="flex -space-x-2 shrink-0">
                {p.stickers.slice(0, 3).map((s, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={s.url} alt="" className="w-11 h-11 object-contain rounded-xl" />)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold flex items-center gap-1.5">{p.title}{p.premium && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,180,0,.16)", color: "#ffb400" }}>Premium</span>}</p>
                <p className="mx-muted text-[13px]">{p.stickers.length} стикеров{p.locked ? " · нужен Premium" : ""}</p>
              </div>
              <button className="mx-chip" onClick={() => add(p)}><Plus size={14} /> Добавить</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Панель стикеров под полем ввода: вкладки-наборы сверху, сетка 4×N. */
export function StickerPanel({ onPick, height = 280 }: { onPick: (slug: string, index: number) => void; height?: number }) {
  const { packs, reload } = useStickerPacks();
  const [cur, setCur] = useState(0);
  const pack = packs?.[Math.min(cur, Math.max(0, (packs?.length ?? 1) - 1))];
  return (
    <div className="flex flex-col" style={{ height }}>
      {packs === null ? <div className="flex-1 flex items-center justify-center"><Spinner /></div> : packs.length === 0 ? (
        <div className="flex-1 mx-scroll p-4">
          <p className="text-center text-[15px] font-semibold mb-1">Стикеров пока нет</p>
          <p className="text-center mx-muted text-[13.5px] mb-3">Наборы добавляются в Настройки → Стикеры (там каталог от администрации).</p>
          <button className="mx-chip mx-auto" onClick={reload}>Обновить</button>
        </div>
      ) : (
        <>
          <div className="flex gap-1 px-2 pt-1 overflow-x-auto mx-noscrollbar shrink-0">
            {packs.map((p, i) => (
              <button key={p.slug} onClick={() => setCur(i)} className="w-11 h-11 shrink-0 rounded-xl p-1 relative" style={{ background: i === cur ? "var(--mx-surface2)" : "transparent" }} aria-label={p.title}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.stickers[0]?.url} alt="" className="w-full h-full object-contain" />
                {p.locked && <Lock size={11} className="absolute right-0.5 bottom-0.5" />}
              </button>
            ))}
          </div>
          <div className="mx-scroll flex-1 grid grid-cols-4 gap-1 px-2 py-1 content-start">
            {pack?.stickers.map((s, i) => (
              <button key={i} onClick={() => onPick(pack.slug, i)} className="aspect-square p-1 rounded-xl active:bg-white/10" style={{ opacity: pack.locked ? 0.45 : 1 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt={s.emoji} className="w-full h-full object-contain" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Download, Link2, Lock, Plus, Star, Trash2 } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import type { MessengerStickerPack } from "@/lib/messenger/types";
import { mApi, MApiError } from "./api";
import { Sheet, Spinner } from "./ui";
import { StickerMedia } from "./StickerMedia";

export type StickerPack = MessengerStickerPack & { locked?: boolean; added?: boolean };

let cache: StickerPack[] | null = null;

/** Мои наборы стикеров (общий кэш на вкладку: панель в чате и страница настроек видят одно и то же). */
export function useStickerPacks() {
  const [packs, setPacks] = useState<StickerPack[] | null>(cache);
  const reload = useCallback(() => {
    mApi<{ packs: StickerPack[] }>("stickers").then((d) => { cache = d.packs; setPacks(d.packs); }).catch(() => setPacks((p) => p ?? []));
  }, []);
  useEffect(reload, [reload]);
  useEffect(() => {
    const f = () => setPacks(cache);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return { packs, reload };
}

/** Принудительно перечитать мои наборы (после добавления/удаления) — все панели получат свежий список. */
const listeners = new Set<() => void>();
export function refreshStickerPacks() {
  mApi<{ packs: StickerPack[] }>("stickers").then((d) => { cache = d.packs; listeners.forEach((f) => f()); }).catch(() => {});
}

/** Из ссылки/имени достаёт, что это: набор Telegram (импортируем) или наш набор (slug). */
function parseStickerInput(input: string): { tg?: string; slug?: string } {
  const t = input.trim();
  if (!t) return {};
  if (/addstickers|[?&]set=/i.test(t) || /t\.me\//i.test(t)) return { tg: t };
  const our = /[?&]stickers=([a-z0-9_]{3,32})/i.exec(t)?.[1] ?? /^([a-z0-9_]{3,32})$/.exec(t)?.[1];
  return our ? { slug: our.toLowerCase() } : { tg: t };
}

/** Добавить набор себе по ссылке — как в Telegram: ссылка t.me/addstickers/…, ссылка на набор в Mili или его имя. */
export async function addPackByLink(input: string): Promise<{ title: string; count: number }> {
  const p = parseStickerInput(input);
  if (p.slug) {
    const d = await mApi<{ pack: StickerPack }>(`stickers?slug=${p.slug}`);
    await mApi("stickers", { slug: p.slug, action: "add" });
    refreshStickerPacks();
    return { title: d.pack.title, count: d.pack.stickers.length };
  }
  const r = await mApi<{ title: string; count: number }>("stickers", { action: "import", url: p.tg ?? input });
  refreshStickerPacks();
  return r;
}

/** Поле «вставь ссылку на стикерпак» — для магазина и настроек. */
export function AddByLinkBox({ onDone }: { onDone?: () => void }) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const r = await addPackByLink(url);
      toast("success", `«${r.title}» добавлен: ${r.count} стикеров`);
      setUrl("");
      onDone?.();
    } catch (e) {
      toast("error", e instanceof MApiError ? e.message : "Не удалось добавить набор");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex gap-2">
        <div className="mx-search flex-1"><Link2 size={17} className="mx-muted shrink-0" /><input className="bg-transparent outline-none flex-1 text-[16px] min-w-0" placeholder="Ссылка на стикерпак (t.me/addstickers/…)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} autoCapitalize="none" autoCorrect="off" inputMode="url" /></div>
        <button className="mx-btn shrink-0" style={{ width: "auto", padding: "0 16px" }} onClick={run} disabled={busy || !url.trim()}>{busy ? <Spinner size={18} /> : "Добавить"}</button>
      </div>
      <p className="mx-muted text-[12.5px] mt-1.5 px-1">Работает со ссылками из Telegram: набор скопируется к нам, в том числе анимированные и видео-стикеры.</p>
    </div>
  );
}

/** Карточка набора: открывается по тапу на стикер в чате или по ссылке — как в Telegram («Добавить N стикеров»). */
export function StickerPackSheet({ slug, onClose }: { slug: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<{ pack: StickerPack; added: boolean; locked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setData(null);
    if (!slug) return;
    mApi<{ pack: StickerPack; added: boolean; locked: boolean }>(`stickers?slug=${slug}`).then(setData).catch(() => { toast("error", "Набор недоступен"); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const toggle = async () => {
    if (!data || busy) return;
    setBusy(true);
    try {
      await mApi("stickers", { slug: data.pack.slug, action: data.added ? "remove" : "add" });
      toast("success", data.added ? "Набор удалён" : `«${data.pack.title}» добавлен`);
      refreshStickerPacks();
      setData({ ...data, added: !data.added });
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!slug} onClose={onClose} title={data?.pack.title ?? "Стикеры"} zIndex={80}>
      {!data ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div className="px-3 pb-4 flex flex-col" style={{ minHeight: 0 }}>
          <p className="mx-muted text-[13px] px-2 pb-2">{data.pack.stickers.length} стикеров{data.pack.premium ? " · Premium" : ""}</p>
          <div className="mx-scroll grid grid-cols-4 gap-1 content-start" style={{ maxHeight: "48vh" }}>
            {data.pack.stickers.map((s, i) => (
              <div key={i} className="aspect-square p-1" style={{ contentVisibility: "auto", containIntrinsicSize: "80px" }}>
                <StickerMedia url={s.url} preview={s.preview} kind={s.kind} size="100%" emoji={s.emoji} />
              </div>
            ))}
          </div>
          <button className="mx-btn mt-3" onClick={toggle} disabled={busy || (data.locked && !data.added)} style={data.added ? { background: "var(--mx-surface2)", color: "var(--mx-danger)" } : undefined}>
            {busy ? <Spinner size={18} /> : data.added ? "Удалить набор" : data.locked ? "Нужен Premium" : `Добавить ${data.pack.stickers.length} стикеров`}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** «Магазин» стикеров: добавить по ссылке + каталог + мои наборы (кнопка «+» в панели стикеров). */
export function StickerStore({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Стикеры" full zIndex={80}>
      <div className="mx-scroll flex-1 min-h-0 px-4 pb-6">
        <div className="mb-4"><AddByLinkBox /></div>
        <StickersSettings inStore />
      </div>
    </Sheet>
  );
}

/** Импорт набора из Telegram — ТОЛЬКО для админ-панели (сервер отклоняет остальных). Набор публикуется в каталоге для всех. */
export function ImportBox({ onDone }: { onDone?: () => void }) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [premium, setPremium] = useState(false);
  const [force, setForce] = useState(false);
  const run = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const r = await mApi<{ title: string; count: number; reused?: boolean; skipped?: number }>("stickers", { action: "import", url, premium, force });
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
      <label className="flex items-center gap-2 mt-1 px-1 text-[14px]"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Скачать заново, если набор уже есть (чтобы появилась анимация)</label>
      <p className="mx-muted text-[12.5px] mt-1.5 px-1">Вставь ссылку на стикерпак из Telegram. Набор появится в каталоге у всех пользователей (Настройки → Стикеры). Анимированные (TGS) и видео-стикеры (WEBM) сохраняются анимированными.</p>
    </div>
  );
}

/** Страница «Стикеры» в настройках. */
export function StickersSettings({ inStore = false }: { inStore?: boolean } = {}) {
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
      reload(); refreshStickerPacks();
      loadCatalog();
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось добавить"); }
  };
  const remove = async (p: StickerPack) => {
    if (!confirm(`Убрать набор «${p.title}»?`)) return;
    try { await mApi("stickers", { slug: p.slug, action: "remove" }); reload(); loadCatalog(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };
  return (
    <div className="space-y-4">
      {!inStore && <AddByLinkBox onDone={() => { reload(); loadCatalog(); }} />}
      {packs === null ? <div className="flex justify-center py-6"><Spinner /></div> : packs.length === 0 ? (
        <p className="mx-muted text-center text-[14px] py-4">Своих наборов пока нет. Добавь любой из каталога ниже — стикеры появятся в поле ввода.</p>
      ) : (
        <div className="mx-card">
          {packs.map((p) => (
            <div key={p.slug} className="flex items-center gap-3 px-4 py-3">
              <div className="flex -space-x-2 shrink-0">
                {p.stickers.slice(0, 3).map((s, i) => <StickerMedia key={i} url={s.url} preview={s.preview} kind={s.kind} size={44} animate={false} emoji={s.emoji} className="rounded-xl" />)}
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
                {p.stickers.slice(0, 3).map((s, i) => <StickerMedia key={i} url={s.url} preview={s.preview} kind={s.kind} size={44} animate={false} emoji={s.emoji} className="rounded-xl" />)}
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

const FAV_KEY = "mx-fav-stickers";
const readFav = (): Recent[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; } };
const writeFav = (l: Recent[]) => { try { localStorage.setItem(FAV_KEY, JSON.stringify(l.slice(0, 60))); } catch {} };

/** Подсказка стикеров по эмодзи — как в Telegram: набрал один эмодзи, над полем ввода появились подходящие стикеры. */
export function StickerSuggest({ text, onPick }: { text: string; onPick: (slug: string, index: number) => void }) {
  const { packs } = useStickerPacks();
  const emoji = text.trim().replace(/\uFE0F/g, "");
  const single = emoji.length > 0 && emoji.length <= 8 && /^\p{Extended_Pictographic}(\u200D\p{Extended_Pictographic})*$/u.test(emoji);
  if (!single || !packs) return null;
  const hits: { slug: string; i: number; s: StickerPack["stickers"][number]; locked?: boolean }[] = [];
  for (const p of packs) p.stickers.forEach((st, i) => { if (st.emoji && st.emoji.replace(/\uFE0F/g, "").includes(emoji)) hits.push({ slug: p.slug, i, s: st, locked: p.locked }); });
  if (hits.length === 0) return null;
  return (
    <div className="flex gap-1 overflow-x-auto mx-noscrollbar px-2 py-1.5" style={{ background: "var(--mx-surface)", borderTop: "1px solid var(--mx-line)" }}>
      {hits.slice(0, 30).map((h) => (
        <button key={`${h.slug}:${h.i}`} onClick={() => !h.locked && onPick(h.slug, h.i)} className="w-16 h-16 shrink-0 rounded-xl p-1 active:bg-white/10" style={{ opacity: h.locked ? 0.45 : 1 }}>
          <StickerMedia url={h.s.url} preview={h.s.preview} kind={h.s.kind} size="100%" emoji={h.s.emoji} />
        </button>
      ))}
    </div>
  );
}

const RECENT_KEY = "mx-recent-stickers";
type Recent = { slug: string; index: number };
const readRecent = (): Recent[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
const pushRecent = (r: Recent) => { try { const cur = readRecent().filter((x) => !(x.slug === r.slug && x.index === r.index)); localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...cur].slice(0, 24))); } catch {} };

/** Панель стикеров под полем ввода: «Недавние» + вкладки-наборы сверху, сетка 4×N, «+» — добавить наборы (как в Telegram). */
export function StickerPanel({ onPick, height = 280 }: { onPick: (slug: string, index: number) => void; height?: number }) {
  const { packs, reload } = useStickerPacks();
  const { toast } = useToast();
  const [cur, setCur] = useState<number>(0); // -1 = недавние, -2 = избранные
  const [fav, setFav] = useState<Recent[]>([]);
  const [store, setStore] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => { const r = readRecent(); setRecent(r); setFav(readFav()); if (r.length) setCur(-1); }, []);
  const idx = cur === -2 ? -2 : cur === -1 && recent.length ? -1 : Math.min(Math.max(cur, 0), Math.max(0, (packs?.length ?? 1) - 1));
  const pack = idx >= 0 ? packs?.[idx] : undefined;
  const resolve = (list: Recent[]) => list.map((r) => { const p = packs?.find((x) => x.slug === r.slug); const st = p?.stickers[r.index]; return p && st ? { r, p, st } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
  const favItems = resolve(fav);
  // долгое нажатие на стикер — добавить/убрать из избранного (как в Telegram)
  const holdRef = useRef<{ t: any; fired: boolean }>({ t: 0, fired: false });
  const holdStart = (slug: string, i: number) => {
    holdRef.current.fired = false;
    clearTimeout(holdRef.current.t);
    holdRef.current.t = setTimeout(() => {
      holdRef.current.fired = true;
      navigator.vibrate?.(8);
      const cur = readFav();
      const has = cur.some((x) => x.slug === slug && x.index === i);
      const next = has ? cur.filter((x) => !(x.slug === slug && x.index === i)) : [{ slug, index: i }, ...cur];
      writeFav(next); setFav(next);
      toast("success", has ? "Убрано из избранного" : "Добавлено в избранное ⭐");
    }, 480);
  };
  const holdEnd = () => clearTimeout(holdRef.current.t);
  const recentItems = recent.map((r) => { const p = packs?.find((x) => x.slug === r.slug); const st = p?.stickers[r.index]; return p && st ? { r, p, st } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
  const pick = (slug: string, i: number, locked?: boolean) => {
    if (holdRef.current.fired) { holdRef.current.fired = false; return; }
    if (locked) return;
    pushRecent({ slug, index: i });
    setRecent(readRecent());
    onPick(slug, i);
  };
  const cell = "aspect-square p-1 rounded-xl active:bg-white/10";
  const cv = { contentVisibility: "auto", containIntrinsicSize: "72px" } as const;
  return (
    <div className="flex flex-col" style={{ height }}>
      {packs === null ? <div className="flex-1 flex items-center justify-center"><Spinner /></div> : packs.length === 0 ? (
        <div className="flex-1 mx-scroll p-4">
          <p className="text-center text-[15px] font-semibold mb-1">Стикеров пока нет</p>
          <p className="text-center mx-muted text-[13.5px] mb-3">Добавь набор по ссылке из Telegram или выбери из каталога.</p>
          <button className="mx-btn mx-auto" style={{ width: "auto", padding: "10px 22px" }} onClick={() => setStore(true)}>Добавить стикеры</button>
        </div>
      ) : (
        <>
          <div className="flex gap-1 px-2 pt-1 overflow-x-auto mx-noscrollbar shrink-0 items-center">
            {favItems.length > 0 && (
              <button onClick={() => setCur(-2)} className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center" style={{ background: idx === -2 ? "var(--mx-surface2)" : "transparent", color: idx === -2 ? "var(--mx-accent)" : "var(--mx-muted)" }} aria-label="Избранные"><Star size={21} /></button>
            )}
            {recentItems.length > 0 && (
              <button onClick={() => setCur(-1)} className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center" style={{ background: idx === -1 ? "var(--mx-surface2)" : "transparent", color: idx === -1 ? "var(--mx-accent)" : "var(--mx-muted)" }} aria-label="Недавние"><Clock size={21} /></button>
            )}
            {packs.map((p, i) => (
              <button key={p.slug} onClick={() => setCur(i)} className="w-11 h-11 shrink-0 rounded-xl p-1 relative" style={{ background: i === idx ? "var(--mx-surface2)" : "transparent" }} aria-label={p.title}>
                {p.stickers[0] && <StickerMedia url={p.stickers[0].url} preview={p.stickers[0].preview} kind={p.stickers[0].kind} size="100%" animate={false} emoji={p.stickers[0].emoji} />}
                {p.locked && <Lock size={11} className="absolute right-0.5 bottom-0.5" />}
              </button>
            ))}
            <button onClick={() => setStore(true)} className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center" style={{ color: "var(--mx-accent)" }} aria-label="Добавить стикеры"><Plus size={22} /></button>
          </div>
          <div className="mx-scroll flex-1 grid grid-cols-4 gap-1 px-2 py-1 content-start">
            {(idx === -1 || idx === -2)
              ? (idx === -1 ? recentItems : favItems).map(({ r, p, st }) => (
                  <button key={`${r.slug}:${r.index}`} onClick={() => pick(r.slug, r.index, p.locked)} onPointerDown={() => holdStart(r.slug, r.index)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd} onContextMenu={(e) => e.preventDefault()} className={cell} style={{ ...cv, opacity: p.locked ? 0.45 : 1 }}>
                    <StickerMedia url={st.url} preview={st.preview} kind={st.kind} size="100%" emoji={st.emoji} />
                  </button>
                ))
              : pack?.stickers.map((s, i) => (
                  <button key={i} onClick={() => pick(pack.slug, i, pack.locked)} onPointerDown={() => holdStart(pack.slug, i)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd} onContextMenu={(e) => e.preventDefault()} className={cell} style={{ ...cv, opacity: pack.locked ? 0.45 : 1 }}>
                    <StickerMedia url={s.url} preview={s.preview} kind={s.kind} size="100%" emoji={s.emoji} />
                  </button>
                ))}
            {idx === -2 && favItems.length === 0 && <p className="mx-muted text-[13px] col-span-4 text-center py-6">Удерживай стикер, чтобы добавить его в избранное</p>}
          </div>
        </>
      )}
      <StickerStore open={store} onClose={() => { setStore(false); reload(); }} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Lock, Trash2 } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import type { MessengerStickerPack } from "@/lib/messenger/types";
import { mApi, MApiError } from "./api";
import { Spinner } from "./ui";
import { safeImageSrc } from "@/lib/safeImage";

// ───────────── Показ стикера: картинка, видео (.webm) или Lottie (.json, из анимированных .tgs) ─────────────

declare global {
  interface Window { lottie?: any } // eslint-disable-line @typescript-eslint/no-explicit-any
}
let lottieLoader: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Lottie подгружается с CDN один раз и только когда в чате встретился анимированный стикер. */
function loadLottie(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.lottie) return Promise.resolve(window.lottie);
  if (!lottieLoader) {
    lottieLoader = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js";
      el.async = true;
      el.onload = () => (window.lottie ? resolve(window.lottie) : reject(new Error("no lottie")));
      el.onerror = () => { lottieLoader = null; reject(new Error("load failed")); };
      document.head.appendChild(el);
    });
  }
  return lottieLoader;
}

/**
 * Стикер любого формата. animate=false — статичное превью (для сеток и вкладок: сотни плееров сразу тормозили бы).
 * Если Lottie не загрузился (нет сети/CDN заблокирован), остаётся статичное превью.
 */
export function StickerMedia({ url, thumb, size, animate = true, alt = "", className = "" }: { url: string; thumb?: string; size?: number; animate?: boolean; alt?: string; className?: string }) {
  const kind = /\.webm(\?|$)/i.test(url) ? "video" : /\.json(\?|$)/i.test(url) ? "lottie" : "img";
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = size ? { width: size, height: size } : undefined;
  const cls = `relative ${size ? "" : "w-full h-full"} ${className}`;

  useEffect(() => {
    if (kind !== "lottie" || !animate) return;
    let dead = false;
    let anim: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    setReady(false);
    loadLottie()
      .then((lottie) => {
        if (dead || !host.current) return;
        anim = lottie.loadAnimation({ container: host.current, renderer: "svg", loop: true, autoplay: true, path: url });
        anim.addEventListener("DOMLoaded", () => !dead && setReady(true));
        anim.addEventListener("data_failed", () => !dead && setFailed(true));
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
      try { anim?.destroy(); } catch { /* ignore */ }
    };
  }, [kind, animate, url]);

  const still = thumb ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={safeImageSrc(thumb)} alt={alt} className="w-full h-full object-contain" draggable={false} loading="lazy" />
  ) : null;

  if (kind === "lottie") {
    return (
      <div className={cls} style={box}>
        {(!animate || failed || !ready) && (still ?? <span className="absolute inset-0 flex items-center justify-center text-[30px]">🧩</span>)}
        {animate && !failed && <div ref={host} className="absolute inset-0" />}
      </div>
    );
  }
  if (kind === "video") {
    if (!animate && still) return <div className={cls} style={box}>{still}</div>;
    return (
      <div className={cls} style={box}>
        <video src={url} poster={thumb} className="w-full h-full object-contain" muted loop playsInline autoPlay={animate} preload={animate ? "auto" : "metadata"} />
      </div>
    );
  }
  return (
    <div className={cls} style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={safeImageSrc(url)} alt={alt} className="w-full h-full object-contain" draggable={false} loading="lazy" />
    </div>
  );
}

export type StickerPack = MessengerStickerPack & { locked?: boolean };

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

/** Поле «вставь ссылку на стикерпак из Telegram» — набор скачивается в MiliGram и добавляется в «мои». */
export function ImportBox({ onDone }: { onDone?: () => void }) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const r = await mApi<{ title: string; count: number; reused?: boolean; skipped?: number }>("stickers", { action: "import", url });
      toast("success", `«${r.title}» добавлен: ${r.count} стикеров${r.skipped ? ` (${r.skipped} пропущено)` : ""}`);
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
      <p className="mx-muted text-[12.5px] mt-1.5 px-1">Скопируй ссылку на стикерпак в Telegram и вставь сюда. Анимированные сохраняются картинкой.</p>
    </div>
  );
}

/** Страница «Стикеры» в настройках. */
export function StickersSettings() {
  const { toast } = useToast();
  const { packs, reload } = useStickerPacks();
  const remove = async (p: StickerPack) => {
    if (!confirm(`Убрать набор «${p.title}»?`)) return;
    try { await mApi("stickers", { slug: p.slug, action: "remove" }); reload(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
  };
  return (
    <div className="space-y-4">
      <div className="mx-card p-4"><ImportBox onDone={reload} /></div>
      {packs === null ? <div className="flex justify-center py-6"><Spinner /></div> : packs.length === 0 ? (
        <p className="mx-muted text-center text-[14px] py-4">Наборов пока нет. Вставь ссылку выше — стикеры появятся в поле ввода.</p>
      ) : (
        <div className="mx-card">
          {packs.map((p) => (
            <div key={p.slug} className="flex items-center gap-3 px-4 py-3">
              <div className="flex -space-x-2 shrink-0">
                {p.stickers.slice(0, 3).map((s, i) => <StickerMedia key={i} url={s.url} thumb={s.thumb} size={44} animate={false} className="rounded-xl" />)}
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
          <p className="text-center mx-muted text-[13.5px] mb-3">Добавь набор из Telegram по ссылке:</p>
          <ImportBox onDone={reload} />
        </div>
      ) : (
        <>
          <div className="flex gap-1 px-2 pt-1 overflow-x-auto mx-noscrollbar shrink-0">
            {packs.map((p, i) => (
              <button key={p.slug} onClick={() => setCur(i)} className="w-11 h-11 shrink-0 rounded-xl p-1 relative" style={{ background: i === cur ? "var(--mx-surface2)" : "transparent" }} aria-label={p.title}>
                {p.stickers[0] && <StickerMedia url={p.stickers[0].url} thumb={p.stickers[0].thumb} animate={false} />}
                {p.locked && <Lock size={11} className="absolute right-0.5 bottom-0.5" />}
              </button>
            ))}
          </div>
          <div className="mx-scroll flex-1 grid grid-cols-4 gap-1 px-2 py-1 content-start">
            {pack?.stickers.map((s, i) => (
              <button key={i} onClick={() => onPick(pack.slug, i)} className="aspect-square p-1 rounded-xl active:bg-white/10" style={{ opacity: pack.locked ? 0.45 : 1 }}>
                <StickerMedia url={s.url} thumb={s.thumb} alt={s.emoji} animate={false} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

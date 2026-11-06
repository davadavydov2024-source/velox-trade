"use client";

import { CSSProperties, memo, useEffect, useId, useRef, useState } from "react";
import { stickerKindOf } from "@/lib/messenger/stickers";
import type { StickerKind } from "@/lib/messenger/types";
import { safeImageSrc } from "@/lib/safeImage";

let lottiePromise: Promise<any> | null = null;
/** Lottie подгружается один раз с CDN (версия зафиксирована) — отдельный npm-пакет в проекте не нужен. */
function loadLottie(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  const w = window as any;
  if (w.lottie) return Promise.resolve(w.lottie);
  if (!lottiePromise) {
    lottiePromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js";
      el.async = true;
      el.onload = () => (w.lottie ? resolve(w.lottie) : reject(new Error("no lottie")));
      el.onerror = () => { lottiePromise = null; reject(new Error("lottie load")); };
      document.head.appendChild(el);
    });
  }
  return lottiePromise;
}

/** Кэш JSON-анимаций: один и тот же стикер в чате не скачивается и не парсится повторно (хранится до 80 штук). */
const lottieData = new Map<string, Promise<any>>();
function fetchLottie(url: string): Promise<any> {
  let p = lottieData.get(url);
  if (!p) {
    p = fetch(url).then((r) => { if (!r.ok) throw new Error("fetch"); return r.json(); });
    p.catch(() => lottieData.delete(url));
    lottieData.set(url, p);
    if (lottieData.size > 80) lottieData.delete(lottieData.keys().next().value as string);
  }
  return p;
}

/** Не больше MAX_PLAYING стикеров играют одновременно — остальные показывают превью (экономит процессор и батарею). */
const MAX_PLAYING = 16;
const playing = new Set<string>();
function acquire(id: string) { if (playing.has(id)) return true; if (playing.size >= MAX_PLAYING) return false; playing.add(id); return true; }
function release(id: string) { playing.delete(id); }

/** true, пока элемент виден на экране (пауза анимаций вне экрана — экономит батарею, когда в сетке десятки стикеров). */
function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

/**
 * Стикер любого типа: картинка / GIF / анимированный WEBP, видео-стикер (.webm) или Lottie (.json, это .tgs из Telegram).
 * animate=false — показать статичную картинку (превью), без запуска анимации (для вкладок и каталога).
 * Lottie подгружается лениво только когда стикер попал на экран; если не вышло — остаётся превью/эмодзи.
 */
function StickerMediaInner({ url, preview, kind, size = 160, animate = true, loop = true, emoji, className, style, onClick }: {
  url: string; preview?: string; kind?: StickerKind; size?: number | string; animate?: boolean; /** false — сыграть один раз и замереть (в чате); тап — повторить */ loop?: boolean; emoji?: string; className?: string; style?: CSSProperties; onClick?: () => void;
}) {
  const k = kind ?? stickerKindOf(url);
  const box: CSSProperties = { width: size, height: size, ...style };
  const [wrapRef, inView] = useInView<HTMLDivElement>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lottieBox = useRef<HTMLDivElement>(null);
  const animRef = useRef<{ play(): void; pause(): void; destroy(): void } | null>(null);
  const [lottieReady, setLottieReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const [slot, setSlot] = useState(false);
  const wantPlay = animate && inView && k !== "image";
  // занимаем «слот» проигрывания, пока стикер виден; вышел из кадра — освобождаем
  useEffect(() => {
    if (wantPlay) setSlot(acquire(id)); else { release(id); setSlot(false); }
    return () => release(id);
  }, [wantPlay, id]);
  const play = wantPlay && slot;
  const replay = () => {
    if (!loop) {
      if (k === "video" && videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play().catch(() => {}); }
      if (k === "lottie" && animRef.current) (animRef.current as any).goToAndPlay(0, true);
    }
    onClick?.();
  };

  // видео: играем только когда виден и animate
  useEffect(() => {
    const v = videoRef.current;
    if (!v || k !== "video") return;
    if (play) v.play().catch(() => {});
    else v.pause();
  }, [k, play]);

  // lottie: загружаем при первом появлении, дальше play/pause
  useEffect(() => {
    if (k !== "lottie" || !play || animRef.current || failed) return;
    let cancelled = false;
    (async () => {
      try {
        const [lottie, data] = await Promise.all([loadLottie(), fetchLottie(url)]);
        if (cancelled || !lottieBox.current) return;
        animRef.current = lottie.loadAnimation({ container: lottieBox.current, renderer: "svg", loop, autoplay: true, animationData: JSON.parse(JSON.stringify(data)), rendererSettings: { preserveAspectRatio: "xMidYMid meet" } });
        setLottieReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [k, play, url, failed, loop]);
  useEffect(() => {
    const a = animRef.current;
    if (!a) return;
    if (play) a.play(); else a.pause();
  }, [play, lottieReady]);
  useEffect(() => () => { animRef.current?.destroy(); animRef.current = null; }, []);

  const still = preview ?? (k === "image" ? url : undefined);

  if (k === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={safeImageSrc(url)} alt={emoji ?? ""} className={className} style={{ ...box, objectFit: "contain", display: "block" }} draggable={false} loading="lazy" decoding="async" onClick={onClick} />;
  }

  if (k === "video") {
    return (
      <div ref={wrapRef} className={className} style={{ ...box, position: "relative" }} onClick={replay}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} src={`${url}#t=0.05`} poster={preview} muted loop={loop} playsInline preload={play ? "auto" : "metadata"} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} />
      </div>
    );
  }

  // lottie
  return (
    <div ref={wrapRef} className={className} style={{ ...box, position: "relative" }} onClick={replay}>
      {still && !lottieReady && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeImageSrc(still)} alt={emoji ?? ""} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} draggable={false} decoding="async" />
      )}
      {!still && !lottieReady && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: typeof size === "number" ? size * 0.45 : 40, opacity: 0.6 }}>{emoji || "🧩"}</span>}
      <div ref={lottieBox} style={{ position: "absolute", inset: 0, display: lottieReady ? "block" : "none", pointerEvents: "none" }} />
    </div>
  );
}

/** Стикер любого типа. Обёрнут в memo: в длинной переписке не перерисовывается без нужды. */
export const StickerMedia = memo(StickerMediaInner);

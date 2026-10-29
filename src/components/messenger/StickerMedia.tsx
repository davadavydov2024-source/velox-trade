"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
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
export function StickerMedia({ url, preview, kind, size = 160, animate = true, emoji, className, style }: {
  url: string; preview?: string; kind?: StickerKind; size?: number | string; animate?: boolean; emoji?: string; className?: string; style?: CSSProperties;
}) {
  const k = kind ?? stickerKindOf(url);
  const box: CSSProperties = { width: size, height: size, ...style };
  const [wrapRef, inView] = useInView<HTMLDivElement>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lottieBox = useRef<HTMLDivElement>(null);
  const animRef = useRef<{ play(): void; pause(): void; destroy(): void } | null>(null);
  const [lottieReady, setLottieReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // видео: играем только когда виден и animate
  useEffect(() => {
    const v = videoRef.current;
    if (!v || k !== "video") return;
    if (animate && inView) v.play().catch(() => {});
    else v.pause();
  }, [k, animate, inView]);

  // lottie: загружаем при первом появлении, дальше play/pause
  useEffect(() => {
    if (k !== "lottie" || !animate || !inView || animRef.current || failed) return;
    let cancelled = false;
    (async () => {
      try {
        const [lottie, res] = await Promise.all([loadLottie(), fetch(url)]);
        if (!res.ok) throw new Error("fetch");
        const data = await res.json();
        if (cancelled || !lottieBox.current) return;
        animRef.current = lottie.loadAnimation({ container: lottieBox.current, renderer: "svg", loop: true, autoplay: true, animationData: data, rendererSettings: { preserveAspectRatio: "xMidYMid meet" } });
        setLottieReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [k, animate, inView, url, failed]);
  useEffect(() => {
    const a = animRef.current;
    if (!a) return;
    if (animate && inView) a.play(); else a.pause();
  }, [animate, inView, lottieReady]);
  useEffect(() => () => { animRef.current?.destroy(); animRef.current = null; }, []);

  const still = preview ?? (k === "image" ? url : undefined);

  if (k === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={safeImageSrc(url)} alt={emoji ?? ""} className={className} style={{ ...box, objectFit: "contain", display: "block" }} draggable={false} loading="lazy" />;
  }

  if (k === "video") {
    return (
      <div ref={wrapRef} className={className} style={{ ...box, position: "relative" }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} src={`${url}#t=0.05`} poster={preview} muted loop playsInline preload={animate ? "auto" : "metadata"} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} />
      </div>
    );
  }

  // lottie
  return (
    <div ref={wrapRef} className={className} style={{ ...box, position: "relative" }}>
      {still && !lottieReady && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeImageSrc(still)} alt={emoji ?? ""} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} draggable={false} />
      )}
      {!still && !lottieReady && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: typeof size === "number" ? size * 0.45 : 40, opacity: 0.6 }}>{emoji || "🧩"}</span>}
      <div ref={lottieBox} style={{ position: "absolute", inset: 0, display: lottieReady ? "block" : "none", pointerEvents: "none" }} />
    </div>
  );
}

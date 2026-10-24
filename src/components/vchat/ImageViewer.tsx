"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { safeImageSrc } from "@/lib/safeImage";

export interface ViewerItem {
  url: string;
  video?: boolean;
}

/** Просмотр на весь экран: свайп влево-вправо между фото/видео (scroll-snap), закрытие крестиком, Esc или нажатием на фон. */
export function ImageViewer({ items, start, onClose }: { items: ViewerItem[]; start: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => setTarget(document.getElementById("vc-root")), []);

  useEffect(() => {
    const el = ref.current;
    if (el && target) el.scrollTo({ left: start * el.clientWidth, behavior: "auto" });
  }, [start, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  const go = (d: number) => {
    const el = ref.current;
    if (!el) return;
    const next = Math.max(0, Math.min(items.length - 1, index + d));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  if (!target) return null;
  return createPortal(
    <div className="absolute inset-0 vc-fade" style={{ zIndex: 80, background: "rgba(0,0,0,0.96)" }}>
      <div
        ref={ref}
        className="h-full w-full flex overflow-x-auto vc-noscrollbar"
        style={{ scrollSnapType: "x mandatory" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {items.map((it, i) => (
          <div key={i} className="w-full h-full shrink-0 flex items-center justify-center p-2" style={{ scrollSnapAlign: "center" }} onClick={onClose}>
            {it.video ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={it.url} controls playsInline autoPlay={i === start} className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={safeImageSrc(it.url)} alt="" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} draggable={false} />
            )}
          </div>
        ))}
      </div>
      <button onClick={onClose} className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-white vc-safe-top" style={{ background: "rgba(255,255,255,0.14)", marginTop: "env(safe-area-inset-top)" }} aria-label="Закрыть">
        <X size={22} />
      </button>
      {items.length > 1 && (
        <>
          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-sm" style={{ marginTop: "env(safe-area-inset-top)" }}>
            {index + 1} из {items.length}
          </p>
          {index > 0 && (
            <button onClick={() => go(-1)} className="hidden min-[900px]:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full items-center justify-center text-white" style={{ background: "rgba(255,255,255,0.14)" }}>
              <ChevronLeft />
            </button>
          )}
          {index < items.length - 1 && (
            <button onClick={() => go(1)} className="hidden min-[900px]:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full items-center justify-center text-white" style={{ background: "rgba(255,255,255,0.14)" }}>
              <ChevronRight />
            </button>
          )}
        </>
      )}
    </div>,
    target
  );
}

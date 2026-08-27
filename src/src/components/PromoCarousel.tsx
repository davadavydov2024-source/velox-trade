"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { getAds } from "@/lib/ads";
import { normalizeExternalUrl } from "@/lib/normalizeUrl";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { Ad } from "@/types";

const AUTOPLAY_MS = 5000;
const SWIPE_THRESHOLD_PX = 40;

export function PromoCarousel() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Драг/свайп — храним смещение пальца/мыши в пикселях, чтобы двигать слайд вслед за жестом.
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useRef(0);

  useEffect(() => {
    getAds(true)
      .then((list) => setAds(list.filter((a) => isValidImageSrc(a.image))))
      .catch(() => setAds([]));
  }, []);

  useEffect(() => {
    if (ads.length < 2 || paused || dragging) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % ads.length), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [ads.length, paused, dragging]);

  const goTo = useCallback(
    (i: number) => {
      if (ads.length === 0) return;
      setIndex(((i % ads.length) + ads.length) % ads.length);
    },
    [ads.length]
  );

  function handlePointerDown(clientX: number) {
    if (ads.length < 2) return;
    dragStartX.current = clientX;
    containerWidth.current = containerRef.current?.offsetWidth || 1;
    setDragging(true);
  }
  function handlePointerMove(clientX: number) {
    if (!dragging) return;
    setDragOffset(clientX - dragStartX.current);
  }
  function handlePointerUp() {
    if (!dragging) return;
    if (dragOffset < -SWIPE_THRESHOLD_PX) goTo(index + 1);
    else if (dragOffset > SWIPE_THRESHOLD_PX) goTo(index - 1);
    setDragging(false);
    setDragOffset(0);
  }

  if (ads.length === 0) return null;

  // Смещение всей ленты слайдов: обычный переход между index'ами + текущий драг-оффсет в процентах.
  const dragPercent = containerWidth.current ? (dragOffset / containerWidth.current) * 100 : 0;
  const translate = -index * 100 + dragPercent;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl overflow-hidden h-40 sm:h-52 lg:h-64 group select-none touch-pan-y"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        handlePointerUp();
      }}
      onMouseDown={(e) => handlePointerDown(e.clientX)}
      onMouseMove={(e) => handlePointerMove(e.clientX)}
      onMouseUp={handlePointerUp}
      onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
      onTouchMove={(e) => handlePointerMove(e.touches[0].clientX)}
      onTouchEnd={handlePointerUp}
    >
      <div
        className="flex h-full"
        style={{
          width: `${ads.length * 100}%`,
          transform: `translateX(${translate / ads.length}%)`,
          transition: dragging ? "none" : "transform 0.5s cubic-bezier(0.65, 0, 0.35, 1)",
        }}
      >
        {ads.map((ad, i) => (
          <div key={ad.id} className="relative h-full" style={{ width: `${100 / ads.length}%` }}>
            <Image
              src={safeImageSrc(ad.image)}
              alt={ad.title}
              fill
              className="object-cover pointer-events-none"
              sizes="(max-width: 1024px) 100vw, 1200px"
              priority={i === 0}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="absolute left-4 sm:left-6 bottom-4 sm:bottom-6 right-4">
              {ad.description && <p className="text-[11px] sm:text-xs text-white/70 mb-1 truncate">{ad.description}</p>}
              <p className="text-base sm:text-xl font-bold text-white mb-2 sm:mb-3 truncate">{ad.title}</p>
              {ad.buttonText && ad.buttonLink && (
                <a
                  href={normalizeExternalUrl(ad.buttonLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-btn"
                  style={{ background: ad.color, color: "#000" }}
                >
                  {ad.buttonText} <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {ads.length > 1 && (
        <>
          {/* Стрелки — видны всегда на мобилке (нет ховера), на десктопе появляются при наведении */}
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Предыдущий слайд"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/60"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Следующий слайд"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/60"
          >
            <ChevronRight size={18} />
          </button>

          <div className="absolute left-4 sm:left-6 top-4 flex gap-1.5">
            {ads.map((a, i) => (
              <button
                key={a.id}
                onClick={() => goTo(i)}
                className={`h-1 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
                aria-label={`Слайд ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

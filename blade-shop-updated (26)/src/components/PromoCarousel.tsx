"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { getAds } from "@/lib/ads";
import { normalizeExternalUrl } from "@/lib/normalizeUrl";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { Ad } from "@/types";

export function PromoCarousel() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    getAds(true)
      .then((list) => setAds(list.filter((a) => isValidImageSrc(a.image))))
      .catch(() => setAds([]));
  }, []);

  useEffect(() => {
    if (ads.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % ads.length), 6000);
    return () => clearInterval(timer);
  }, [ads.length]);

  if (ads.length === 0) return null;
  const ad = ads[index];

  return (
    <div className="relative w-full rounded-2xl overflow-hidden h-40 sm:h-52 lg:h-64">
      <Image src={safeImageSrc(ad.image)} alt={ad.title} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 1200px" priority />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute left-4 sm:left-6 bottom-4 sm:bottom-6 right-4">
        {ad.description && <p className="text-[11px] sm:text-xs text-white/70 mb-1 truncate">{ad.description}</p>}
        <p className="text-base sm:text-xl font-bold text-white mb-2 sm:mb-3 truncate">{ad.title}</p>
        {ad.buttonText && ad.buttonLink && (
          <a
            href={normalizeExternalUrl(ad.buttonLink)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-btn"
            style={{ background: ad.color, color: "#000" }}
          >
            {ad.buttonText} <ExternalLink size={13} />
          </a>
        )}
      </div>
      {ads.length > 1 && (
        <div className="absolute left-4 sm:left-6 top-4 flex gap-1.5">
          {ads.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setIndex(i)}
              className={`h-1 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
              aria-label={`Слайд ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

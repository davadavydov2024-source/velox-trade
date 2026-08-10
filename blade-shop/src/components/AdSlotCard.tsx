"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Megaphone, ExternalLink } from "lucide-react";
import { getAds } from "@/lib/ads";
import { normalizeExternalUrl } from "@/lib/normalizeUrl";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { Ad } from "@/types";

export function AdSlotCard() {
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    getAds(true)
      .then((list) => {
        // Первое по приоритету объявление уже крутится в большой карусели рядом — берём
        // следующее, чтобы не показывать одно и то же дважды на одном экране.
        const withImage = list.filter((a) => isValidImageSrc(a.image));
        setAd(withImage[1] ?? (list.length > 1 ? list[1] : null));
      })
      .catch(() => setAd(null));
  }, []);

  if (!ad) return null;

  return (
    <div className="card p-4 sm:p-5 relative overflow-hidden">
      {ad.image && isValidImageSrc(ad.image) && (
        <>
          <Image src={safeImageSrc(ad.image)} alt="" fill className="object-cover" sizes="320px" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d1017] via-[#0d1017]/85 to-[#0d1017]/40" />
        </>
      )}
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Megaphone size={16} className="text-accent" />
          <p className="text-[10px] uppercase tracking-wide text-white/40 font-semibold">Реклама</p>
        </div>
        <p className="text-sm font-semibold mb-1 line-clamp-2">{ad.title}</p>
        {ad.description && <p className="text-xs text-white/50 mb-3 line-clamp-2">{ad.description}</p>}
        {ad.buttonText && ad.buttonLink && (
          <a
            href={normalizeExternalUrl(ad.buttonLink)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full py-2.5 text-sm text-center flex items-center justify-center gap-1.5"
          >
            {ad.buttonText} <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

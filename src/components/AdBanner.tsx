"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { getAds } from "@/lib/ads";
import { normalizeExternalUrl } from "@/lib/normalizeUrl";
import { Ad } from "@/types";

export function AdBanner() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    getAds(true)
      .then(setAds)
      .catch(() => {
        // Реклама не настроена или Firestore недоступен — баннер просто не покажется
      });
  }, []);

  const visible = ads.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-2">
      {visible.map((ad) => (
        <div
          key={ad.id}
          className="rounded-card p-4 flex items-center justify-between gap-4"
          style={{ background: `${ad.color}1a`, border: `1px solid ${ad.color}40` }}
        >
          <div className="min-w-0">
            <p className="font-semibold text-sm" style={{ color: ad.color }}>
              {ad.title}
            </p>
            {ad.description && <p className="text-xs text-white/50 truncate">{ad.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ad.buttonText && ad.buttonLink && (
              <a
                href={normalizeExternalUrl(ad.buttonLink)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold px-3 py-1.5 rounded-btn flex items-center gap-1"
                style={{ background: ad.color, color: "#000" }}
              >
                {ad.buttonText} <ExternalLink size={12} />
              </a>
            )}
            <button
              onClick={() => setDismissed((d) => [...d, ad.id])}
              className="text-white/30 hover:text-white/70"
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

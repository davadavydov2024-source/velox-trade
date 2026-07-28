"use client";

import { useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";

export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6 cursor-zoom-out"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white p-2" aria-label="Закрыть">
        <X size={24} />
      </button>
      <div className="relative w-full h-full max-w-4xl">
        <Image src={src} alt={alt} fill className="object-contain" sizes="100vw" />
      </div>
    </div>
  );
}

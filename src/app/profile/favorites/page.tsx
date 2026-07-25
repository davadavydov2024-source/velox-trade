"use client";

import { Heart } from "lucide-react";
import { useLanguage } from "@/lib/languageStore";

export default function FavoritesPage() {
  const { t } = useLanguage();
  return (
    <div className="card p-10 text-center">
      <Heart className="mx-auto text-white/20 mb-3" size={32} />
      <p className="text-white/40">{t("favorites_empty")}</p>
      <p className="text-white/30 text-sm mt-1">{t("favorites_hint")}</p>
    </div>
  );
}

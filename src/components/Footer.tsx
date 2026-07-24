"use client";

import Link from "next/link";
import { Swords } from "lucide-react";
import { useLanguage } from "@/lib/languageStore";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-border mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 font-bold mb-3">
            <Swords className="text-accent" size={20} />
            VELOX TRADE
          </div>
          <p className="text-white/40">{t("footer_tagline")}</p>
        </div>
        <div>
          <p className="text-white/40 mb-3">{t("footer_shop")}</p>
          <div className="flex flex-col gap-2 text-white/70">
            <Link href="/games">{t("nav_games")}</Link>
            <Link href="/catalog">{t("nav_catalog")}</Link>
            <Link href="/catalog?new=1">{t("nav_new")}</Link>
          </div>
        </div>
        <div>
          <p className="text-white/40 mb-3">{t("footer_support")}</p>
          <div className="flex flex-col gap-2 text-white/70">
            <Link href="/chats?tab=support">{t("footer_support_center")}</Link>
            <Link href="/chats?tab=support#faq">{t("footer_faq")}</Link>
          </div>
        </div>
        <div>
          <p className="text-white/40 mb-3">{t("footer_account")}</p>
          <div className="flex flex-col gap-2 text-white/70">
            <Link href="/profile">{t("footer_my_account")}</Link>
            <Link href="/profile/topup">{t("footer_topup")}</Link>
          </div>
        </div>
      </div>
      <div className="text-center text-white/30 text-xs py-4 border-t border-border">
        © {new Date().getFullYear()} Velox Trade. {t("footer_rights")}
      </div>
    </footer>
  );
}

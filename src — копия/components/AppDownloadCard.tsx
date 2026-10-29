"use client";

import { useEffect, useState } from "react";
import { Smartphone, Download, Share, PlusSquare, CheckCircle2 } from "lucide-react";
import { isAndroid, isIos, isStandalone } from "@/lib/platform";

// Ссылка на готовый APK (после сборки через PWABuilder): положи файл в public/downloads/ и задай
// NEXT_PUBLIC_ANDROID_APK_URL=/downloads/velox-trade.apk — либо укажи ссылку на GitHub Releases.
const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL;

/**
 * Карточка "Приложение" в профиле — показывает то, что реально нужно именно этому устройству:
 *  • установленное приложение — зелёную отметку;
 *  • iPhone в обычном Safari — как добавить сайт на экран «Домой» (без этого push на iOS не работают);
 *  • Android — кнопку скачивания APK, если он уже собран и ссылка задана;
 *  • компьютер и всё остальное — ничего (карточка скрыта).
 */
export function AppDownloadCard() {
  const [platform, setPlatform] = useState<"installed" | "ios" | "android" | null>(null);

  useEffect(() => {
    if (isStandalone()) setPlatform("installed");
    else if (isIos()) setPlatform("ios");
    else if (isAndroid() && APK_URL) setPlatform("android");
  }, []);

  if (!platform) return null;

  if (platform === "installed") {
    return (
      <div className="card p-4 flex items-center gap-3">
        <CheckCircle2 size={18} className="text-green-400 shrink-0" />
        <p className="text-sm text-white/60">Ты пользуешься установленным приложением Velox Trade.</p>
      </div>
    );
  }

  if (platform === "android") {
    return (
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
            <Smartphone size={18} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Приложение для Android</p>
            <p className="text-sm text-white/45 mt-0.5">
              Отдельная иконка, полноэкранный режим и push-уведомления о сделках и сообщениях.
            </p>
            <a
              href={APK_URL}
              download
              className="btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2 mt-3"
            >
              <Download size={15} /> Скачать APK
            </a>
            <p className="text-[11px] text-white/30 mt-2.5 leading-relaxed">
              Открой скачанный файл. Если Android спросит — разреши установку из этого источника (браузера), это
              обычное требование для приложений вне Google Play.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
          <Smartphone size={18} className="text-accent" />
        </div>
        <div>
          <p className="font-medium">Приложение на iPhone</p>
          <p className="text-sm text-white/45 mt-0.5">
            Добавь сайт на экран «Домой» — получишь иконку, полноэкранный режим и push-уведомления.
          </p>
          <ol className="text-sm text-white/65 space-y-1.5 mt-3 list-decimal list-inside marker:text-accent">
            <li>
              Нажми «Поделиться» <Share size={13} className="inline -mt-0.5 mx-0.5" /> в Safari
            </li>
            <li>
              Выбери <b>«На экран «Домой»»</b> <PlusSquare size={13} className="inline -mt-0.5 mx-0.5" />, затем «Добавить»
            </li>
            <li>Открой Velox Trade с главного экрана и включи уведомления здесь же, ниже</li>
          </ol>
          <p className="text-[11px] text-white/30 mt-2.5">Нужен iOS 16.4 или новее. Только Safari — в Chrome для iPhone это не работает.</p>
        </div>
      </div>
    </div>
  );
}

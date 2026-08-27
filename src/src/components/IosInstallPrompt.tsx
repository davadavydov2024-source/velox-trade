"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Share, X, Download, PlusSquare } from "lucide-react";

const DISMISS_KEY = "vt_ios_install_dismissed";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iosDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ маскируется под Mac Safari — отличаем по тачскрину, у настольного Mac его нет.
  const iPadOs13 = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iosDevice || iPadOs13;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function InstructionsModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold flex items-center gap-2">
            <Download size={17} className="text-accent" /> Установить Velox Trade
          </p>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <ol className="space-y-3.5 text-sm">
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center flex-none">1</span>
            <span className="pt-0.5">
              Нажми кнопку «Поделиться» <Share size={14} className="inline -mt-0.5 mx-0.5" /> внизу (или сверху) экрана в Safari
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center flex-none">2</span>
            <span className="pt-0.5">
              Прокрути список вниз и выбери <b>«На экран «Домой»»</b> <PlusSquare size={14} className="inline -mt-0.5 mx-0.5" />
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center flex-none">3</span>
            <span className="pt-0.5">
              Нажми <b>«Добавить»</b> в правом верхнем углу — готово, иконка появится на главном экране
            </span>
          </li>
        </ol>
        <button onClick={onClose} className="btn-primary w-full py-2.5 text-sm mt-5">
          Понятно
        </button>
      </div>
    </div>,
    document.body
  );
}

export function IosInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!isIos() || isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="fixed left-1/2 -translate-x-1/2 bottom-20 lg:bottom-5 z-[90] flex items-center gap-2 bg-accent text-black text-sm font-semibold pl-4 pr-2 py-2.5 rounded-full shadow-glow"
      >
        <Download size={16} /> Установить приложение
        <span
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="ml-1 p-1 rounded-full hover:bg-black/10"
          aria-label="Скрыть"
        >
          <X size={14} />
        </span>
      </button>
      {showModal && <InstructionsModal onClose={() => { setShowModal(false); dismiss(); }} />}
    </>
  );
}

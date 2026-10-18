"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { X, Check } from "lucide-react";
import { getCroppedImageBlob } from "@/lib/cropImage";

interface ImageCropModalProps {
  imageSrc: string;
  aspect?: number; // 1 = квадрат (для аватара), 4/3 или 1 для товаров и т.д.
  aspectOptions?: { label: string; value: number }[]; // кнопки выбора пропорций
  round?: boolean; // круглая рамка (аватар)
  maxWidth?: number; // максимальная ширина результата, px
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

export function ImageCropModal({ imageSrc, aspect: initialAspect = 1, aspectOptions, round = false, maxWidth, onCancel, onCropped }: ImageCropModalProps) {
  const [aspect, setAspect] = useState(initialAspect);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixelsValue: Area) => {
    setCroppedAreaPixels(croppedAreaPixelsValue);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, "image/jpeg", maxWidth);
      onCropped(blob);
    } finally {
      setProcessing(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-lg rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-medium text-sm">Обрежь фото</p>
          <button onClick={onCancel} className="p-1 rounded-btn hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div className="relative w-full bg-black" style={{ height: "min(360px, 45vh)" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={round ? "round" : "rect"}
            showGrid={!round}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="p-4 space-y-3">
          {aspectOptions && aspectOptions.length > 1 && !round && (
            <div>
              <p className="text-xs text-white/40 mb-1.5">Пропорции</p>
              <div className="flex flex-wrap gap-1.5">
                {aspectOptions.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => setAspect(o.value)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                      Math.abs(aspect - o.value) < 0.001 ? "bg-accent text-black font-medium" : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-white/40 mb-1">Масштаб</p>
            <input
              autoComplete="off"
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-secondary flex-1 py-2.5 text-sm">
              Отмена
            </button>
            <button
              onClick={handleConfirm}
              disabled={processing || !croppedAreaPixels}
              className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check size={15} /> {processing ? "Обрезаем..." : "Готово"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

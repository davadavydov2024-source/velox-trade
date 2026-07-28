"use client";

import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { X, Check } from "lucide-react";
import { getCroppedImageBlob } from "@/lib/cropImage";

interface ImageCropModalProps {
  imageSrc: string;
  aspect?: number; // 1 = квадрат (для аватара), 4/3 или 1 для товаров и т.д.
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

export function ImageCropModal({ imageSrc, aspect = 1, onCancel, onCropped }: ImageCropModalProps) {
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
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      onCropped(blob);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-lg rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-medium text-sm">Обрежь фото</p>
          <button onClick={onCancel} className="p-1 rounded-btn hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div className="relative w-full bg-black" style={{ height: 360 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs text-white/40 mb-1">Масштаб</p>
            <input
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
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, X, Crop } from "lucide-react";
import { uploadImage, ImageUploadError } from "@/lib/storage";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { useToast } from "@/lib/toastContext";
import { ImageCropModal } from "./ImageCropModal";
import { CROP_PRESETS, CropPurpose, DEFAULT_PURPOSE_BY_FOLDER } from "@/lib/imageCropPresets";

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  label?: string;
  shape?: "square" | "round";
  size?: number;
  disabled?: boolean;
  aspect?: number; // явное соотношение сторон (перекрывает пресет назначения)
  purpose?: CropPurpose; // назначение фото: от него зависят пропорции, форма и размер результата
}

export function ImageUploadField({
  value,
  onChange,
  folder,
  label,
  shape = "square",
  size = 96,
  disabled = false,
  aspect: aspectProp,
  purpose,
}: ImageUploadFieldProps) {
  const preset = CROP_PRESETS[purpose ?? DEFAULT_PURPOSE_BY_FOLDER[folder] ?? "square"];
  const isRound = shape === "round" || !!preset.round;
  const aspect = isRound ? 1 : aspectProp ?? preset.aspect;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const { toast } = useToast();

  function handleFile(file: File | undefined) {
    if (!file) return;
    // Сначала показываем обрезку — сама загрузка произойдёт после подтверждения кадра.
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleCropped(blob: Blob) {
    setCropSrc(null);
    setUploading(true);
    try {
      const file = new File([blob], "upload.jpg", { type: blob.type || "image/jpeg" });
      const url = await uploadImage(file, folder);
      onChange(url);
    } catch (err) {
      if (err instanceof ImageUploadError) {
        toast("error", err.message);
      } else {
        toast("error", "Не удалось загрузить файл. Проверь, что Firebase Storage включён (см. README).");
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const radius = isRound ? "rounded-full" : "rounded-xl";
  // Превью повторяет пропорции будущего фото (широкое — шире, высокое — выше).
  const previewW = aspect >= 1 ? Math.min(Math.round(size * aspect), 240) : size;
  const previewH = aspect >= 1 ? Math.round(previewW / aspect) : Math.round(size / aspect);
  const inputId = `upload-${folder}-${label ?? "field"}`.replace(/\s+/g, "-");

  return (
    <div>
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          aspect={aspect}
          round={isRound}
          aspectOptions={aspectProp ? undefined : preset.options}
          maxWidth={preset.maxWidth}
          onCancel={() => {
            setCropSrc(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          onCropped={handleCropped}
        />
      )}
      {label && <label className="text-xs text-white/40 mb-1.5 block">{label}</label>}
      <div className="flex items-center gap-3">
        <div className={`relative bg-black/30 shrink-0 overflow-hidden ${radius}`} style={{ width: previewW, height: previewH }}>
          {isValidImageSrc(value) && <Image src={safeImageSrc(value)} alt="" fill className="object-cover" sizes={`${previewW}px`} />}
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            autoComplete="off"
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
            id={inputId}
            disabled={disabled}
          />
          <label
            htmlFor={disabled ? undefined : inputId}
            className={`btn-secondary py-2 px-3 text-sm inline-flex items-center gap-2 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <Crop size={14} /> {uploading ? "Загрузка..." : value ? "Заменить файл (с обрезкой)" : "Загрузить файл (с обрезкой)"}
          </label>
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs text-white/30 hover:text-red-400 flex items-center gap-1 ml-2"
            >
              <X size={12} /> Убрать
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

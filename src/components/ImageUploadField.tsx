"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, Loader2, X } from "lucide-react";
import { uploadImage, ImageUploadError } from "@/lib/storage";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { useToast } from "@/lib/toastContext";

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  label?: string;
  shape?: "square" | "round";
  size?: number;
  disabled?: boolean;
}

export function ImageUploadField({ value, onChange, folder, label, shape = "square", size = 96, disabled = false }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
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

  const radius = shape === "round" ? "rounded-full" : "rounded-xl";
  const inputId = `upload-${folder}-${label ?? "field"}`.replace(/\s+/g, "-");

  return (
    <div>
      {label && <label className="text-xs text-white/40 mb-1.5 block">{label}</label>}
      <div className="flex items-center gap-3">
        <div className={`relative bg-black/30 shrink-0 overflow-hidden ${radius}`} style={{ width: size, height: size }}>
          {isValidImageSrc(value) && <Image src={safeImageSrc(value)} alt="" fill className="object-cover" sizes={`${size}px`} />}
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
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
            <Upload size={14} /> {uploading ? "Загрузка..." : value ? "Заменить файл" : "Загрузить файл"}
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

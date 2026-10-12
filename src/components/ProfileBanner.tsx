"use client";

import { useRef, useState, ReactNode } from "react";
import Image from "next/image";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { uploadImage, ImageUploadError } from "@/lib/storage";
import { isValidImageSrc, safeImageSrc } from "@/lib/safeImage";
import { ImageCropModal } from "./ImageCropModal";

/** Соотношение сторон обложки — широкая полоса, как в Telegram/Twitter. */
const BANNER_ASPECT = 3;

/**
 * Обложка профиля. Для всех — просто красивая картинка/градиент. Если editable (админ на СВОЁМ
 * профиле) — поверх появляются кнопки «Сменить» / «Убрать»: загрузка с обрезкой → папка "banners"
 * (на сервере только для админов) → api/profile/banner (тоже проверка админа на сервере).
 */
export function ProfileBanner({
  url,
  editable = false,
  onChange,
  className = "h-28 sm:h-40",
  children,
}: {
  url?: string | null;
  editable?: boolean;
  onChange?: (url: string | null) => void;
  className?: string;
  children?: ReactNode;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasImage = isValidImageSrc(url);

  async function save(newUrl: string | null) {
    if (!user) return;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/profile/banner", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ bannerURL: newUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Не удалось сохранить баннер");
    onChange?.(newUrl);
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleCropped(blob: Blob) {
    setCropSrc(null);
    setBusy(true);
    try {
      const file = new File([blob], "banner.jpg", { type: blob.type || "image/jpeg" });
      const uploaded = await uploadImage(file, "banners");
      await save(uploaded);
      toast("success", "Баннер обновлён");
    } catch (err: any) {
      toast("error", err instanceof ImageUploadError || err?.message ? err.message : "Не удалось загрузить баннер");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await save(null);
      toast("success", "Баннер убран");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось убрать баннер");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          aspect={BANNER_ASPECT}
          onCancel={() => {
            setCropSrc(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          onCropped={handleCropped}
        />
      )}

      {hasImage ? (
        <Image src={safeImageSrc(url)} alt="" fill priority className="object-cover" sizes="(max-width: 1024px) 100vw, 900px" />
      ) : (
        // Запасной фон — переливающийся градиент в цветах сайта + сетка из светящихся пятен.
        <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, var(--color-accent) 0%, #4a6cf7 55%, #22c55e 100%)", opacity: 0.35 }}>
          <div className="absolute -top-10 -left-6 w-48 h-48 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-12 right-10 w-56 h-56 rounded-full bg-black/30 blur-3xl" />
        </div>
      )}
      {/* Затемнение снизу: аватар и текст поверх обложки всегда читаются. */}
      <div className="absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-transparent pointer-events-none" />

      {editable && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/55 hover:bg-black/75 backdrop-blur text-white disabled:opacity-60 transition-colors"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {hasImage ? "Сменить баннер" : "Добавить баннер"}
          </button>
          {hasImage && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              aria-label="Убрать баннер"
              className="p-1.5 rounded-full bg-black/55 hover:bg-red-500/80 backdrop-blur text-white disabled:opacity-60 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

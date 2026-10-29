export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Вырезает выбранную область из изображения и возвращает результат как Blob (JPEG). */
export async function getCroppedImageBlob(imageSrc: string, crop: PixelCrop, mimeType = "image/jpeg", maxWidth?: number): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  // Если указан maxWidth — уменьшаем результат (не увеличиваем): быстрее грузится и не упирается в лимит размера.
  const scale = maxWidth && crop.width > maxWidth ? maxWidth / crop.width : 1;
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен в этом браузере");

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось обрезать изображение"))),
      mimeType,
      0.92
    );
  });
}

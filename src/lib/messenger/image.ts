/** Уменьшает картинку (обложку) до maxSide пикселей по большей стороне и сжимает в JPEG: 3 МБ превращаются в ~50 КБ. */
export function shrinkImage(src: Blob, maxSide = 512, quality = 0.82): Promise<File | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const g = c.getContext("2d")!;
        g.fillStyle = "#000"; g.fillRect(0, 0, w, h); // JPEG без прозрачности
        g.drawImage(img, 0, 0, w, h);
        c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b ? new File([b], "cover.jpg", { type: "image/jpeg" }) : null); }, "image/jpeg", quality);
      } catch { URL.revokeObjectURL(url); resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

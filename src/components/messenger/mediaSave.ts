"use client";

/**
 * Сохранение голосовых и видеокружков на устройство — как в Telegram, но для кружков добавляем
 * водяной знак (ссылка на мессенджер), чтобы при пересылке сохранённого видео было видно, откуда оно.
 */

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/** Голосовое — просто сохраняем файл как есть, водяной знак на звук не накладываем. */
export async function saveVoiceToGallery(url: string, filename = "voice-message"): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch-failed");
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "ogg").split(";")[0];
  downloadBlob(blob, `${filename}.${ext}`);
}

function watermarkLabel(): string {
  try {
    return `MiliGram · ${window.location.host}`;
  } catch {
    return "MiliGram";
  }
}

/** Рисует плашку с названием мессенджера поверх кадра — так же, как подписывают скачанные видео в TikTok. */
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, label: string) {
  const fontSize = Math.max(11, Math.round(w * 0.048));
  ctx.font = `600 ${fontSize}px -apple-system, Segoe UI, Roboto, sans-serif`;
  const padX = fontSize * 0.7;
  const padY = fontSize * 0.5;
  const textW = ctx.measureText(label).width;
  const pillW = textW + padX * 2;
  const pillH = fontSize + padY * 2;
  const x = w / 2 - pillW / 2;
  const y = h - pillH - h * 0.045;
  const r = pillH / 2;

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r);
  ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r);
  ctx.arcTo(x, y + pillH, x, y, r);
  ctx.arcTo(x, y, x + pillW, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(label, x + pillW / 2, y + pillH / 2 + fontSize * 0.04);
  ctx.restore();
}

/**
 * Перерисовывает видеокружок кадр за кадром в canvas с водяным знаком и перезаписывает в webm —
 * звук берётся из оригинала через captureStream(). Требует, чтобы видео отдавалось с CORS-заголовками,
 * иначе браузер не даёт читать кадры (ошибка безопасности) — в этом случае сохраняем файл без знака.
 */
export async function saveVideoNoteToGallery(url: string, filename = "video-note"): Promise<"watermarked" | "plain"> {
  const supportsRecorder = typeof MediaRecorder !== "undefined";
  if (!supportsRecorder) {
    await savePlainFile(url, filename, "mp4");
    return "plain";
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = url;
  video.muted = false;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("load-failed"));
    });

    const w = video.videoWidth || 480;
    const h = video.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-ctx");

    const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    let audioTracks: MediaStreamTrack[] = [];
    try {
      const withCapture = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
      const srcStream = withCapture.captureStream ? withCapture.captureStream() : withCapture.mozCaptureStream?.();
      audioTracks = srcStream ? srcStream.getAudioTracks() : [];
    } catch {
      // без звука тоже сохраним — лучше немое видео, чем ничего
    }

    const outStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
    const recorder = new MediaRecorder(outStream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

    const label = watermarkLabel();
    let raf = 0;
    const draw = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, w, h);
      drawWatermark(ctx, w, h, label);
      raf = requestAnimationFrame(draw);
    };

    video.currentTime = 0;
    recorder.start(250);
    await video.play();
    draw();
    await new Promise<void>((resolve) => { video.onended = () => resolve(); });
    cancelAnimationFrame(raf);
    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: "video/webm" });
    if (blob.size < 500) throw new Error("empty-recording");
    downloadBlob(blob, `${filename}.webm`);
    return "watermarked";
  } catch {
    await savePlainFile(url, filename, "mp4");
    return "plain";
  }
}

async function savePlainFile(url: string, filename: string, fallbackExt: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch-failed");
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || fallbackExt).split(";")[0];
  downloadBlob(blob, `${filename}.${ext}`);
}

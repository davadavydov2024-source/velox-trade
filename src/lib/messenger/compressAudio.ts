/**
 * Сжатие песни перед загрузкой (в браузере администратора): декодируем файл через Web Audio и заново кодируем в MP3 с нужным битрейтом.
 * Это обычное перекодирование, ИИ тут не нужен: 320 kbps → 128 kbps уменьшает файл в ~2,5 раза почти без потери качества на слух.
 * Энкодер lamejs подгружается с CDN только при сжатии; если не получилось — вызывающий код загружает исходный файл.
 */
export interface CompressResult { file: File; before: number; after: number; compressed: boolean; norm?: number }

type Mp3EncoderCtor = new (channels: number, sampleRate: number, kbps: number) => { encodeBuffer(l: Int16Array, r?: Int16Array): Int8Array; flush(): Int8Array };

let encoderPromise: Promise<Mp3EncoderCtor> | null = null;
function loadEncoder(): Promise<Mp3EncoderCtor> {
  if (!encoderPromise) {
    // сначала свой файл с этого же сайта (/public/vendor/lamejs.js), потом запасные CDN
    const urls: string[] = [
      "/vendor/lamejs.js",
      "https://cdn.jsdelivr.net/npm/@breezystack/lamejs@1.2.7/dist/lamejs.js",
      "https://unpkg.com/@breezystack/lamejs@1.2.7/dist/lamejs.js",
    ];
    encoderPromise = (async () => {
      let last = "";
      for (const u of urls) {
        try {
          const m: any = await import(/* webpackIgnore: true */ (u.startsWith("/") ? location.origin + u : u) as string);
          const E = m.Mp3Encoder ?? m.default?.Mp3Encoder;
          if (E) return E as Mp3EncoderCtor;
          last = "в модуле нет Mp3Encoder";
        } catch (e: any) { last = String(e?.message || e); }
      }
      throw new Error("Не загрузился MP3-кодировщик: " + last);
    })();
    encoderPromise.catch(() => { encoderPromise = null; });
  }
  return encoderPromise;
}

const toInt16Chunk = (f: Float32Array, from: number, to: number): Int16Array => {
  const o = new Int16Array(to - from);
  for (let i = from; i < to; i++) { const s = Math.max(-1, Math.min(1, f[i])); o[i - from] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return o;
};

async function decode(file: File): Promise<AudioBuffer> {
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  try {
    const ab = await file.arrayBuffer();
    return await new Promise<AudioBuffer>((res, rej) => {
      const r = ctx.decodeAudioData(ab, res, (e) => rej(e || new Error("decode failed")));
      if (r && typeof (r as any).catch === "function") (r as any).catch(rej);
    });
  } catch (e: any) {
    throw new Error("Не удалось декодировать звук (" + (e?.message || e?.name || "формат не поддерживается или не хватает памяти") + ")");
  } finally { ctx.close().catch(() => {}); }
}

export async function compressAudio(file: File, kbps = 128, onProgress?: (ratio: number) => void): Promise<CompressResult> {
  const before = file.size;
  const Enc = await loadEncoder();
  let buf: AudioBuffer = await decode(file);

  // lamejs надёжно работает на 44.1/48/32 кГц — остальное приводим к 44.1
  let rate = buf.sampleRate;
  if (![32000, 44100, 48000].includes(rate)) {
    const off = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(buf.duration * 44100), 44100);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    buf = await off.startRendering(); rate = 44100;
  }
  // громкость: RMS по выборке; песни громче -16 dBFS получают множитель <1, чтобы все звучали ровно (тихие не трогаем)
  let norm = 1;
  try {
    const d0 = buf.getChannelData(0);
    let sum = 0, n = 0;
    for (let i = 0; i < d0.length; i += 7) { sum += d0[i] * d0[i]; n++; }
    const rmsDb = n ? 10 * Math.log10(sum / n + 1e-12) : -16;
    norm = Math.max(0.25, Math.min(1, Math.pow(10, (-16 - rmsDb) / 20)));
    norm = Math.round(norm * 1000) / 1000;
  } catch {}
  const ch = Math.min(2, buf.numberOfChannels);
  const L = buf.getChannelData(0);
  const R = ch === 2 ? buf.getChannelData(1) : undefined;
  const enc = new Enc(ch, rate, ch === 1 ? Math.min(kbps, 96) : kbps);

  const parts: BlobPart[] = [];
  const STEP = 1152 * 20;
  for (let i = 0; i < L.length; i += STEP) {
    const e = Math.min(L.length, i + STEP);
    const out = R ? enc.encodeBuffer(toInt16Chunk(L, i, e), toInt16Chunk(R, i, e)) : enc.encodeBuffer(toInt16Chunk(L, i, e));
    if (out.length) parts.push(new Uint8Array(out));
    if ((i / STEP) % 25 === 0) { onProgress?.(i / L.length); await new Promise((r) => setTimeout(r)); } // отдаём управление браузеру
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  onProgress?.(1);

  const blob = new Blob(parts, { type: "audio/mpeg" });
  if (blob.size >= before * 0.95) return { file, before, after: before, compressed: false, norm }; // не выиграли — оставляем оригинал
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".mp3", { type: "audio/mpeg" }), before, after: blob.size, compressed: true, norm };
}

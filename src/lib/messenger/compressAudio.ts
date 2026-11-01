/**
 * Сжатие песни перед загрузкой (в браузере администратора): декодируем файл через Web Audio и заново кодируем в MP3 с нужным битрейтом.
 * Это обычное перекодирование, ИИ тут не нужен: 320 kbps → 128 kbps уменьшает файл в ~2,5 раза почти без потери качества на слух.
 * Энкодер lamejs подгружается с CDN только при сжатии; если не получилось — вызывающий код загружает исходный файл.
 */
export interface CompressResult { file: File; before: number; after: number; compressed: boolean }

type Mp3EncoderCtor = new (channels: number, sampleRate: number, kbps: number) => { encodeBuffer(l: Int16Array, r?: Int16Array): Int8Array; flush(): Int8Array };

let encoderPromise: Promise<Mp3EncoderCtor> | null = null;
function loadEncoder(): Promise<Mp3EncoderCtor> {
  if (!encoderPromise) {
    const url: string = "https://cdn.jsdelivr.net/npm/@breezystack/lamejs@1/+esm"; // адрес в переменной, чтобы TypeScript и webpack не пытались его собрать
    encoderPromise = (import(/* webpackIgnore: true */ url) as Promise<any>).then((m: any) => (m.Mp3Encoder ?? m.default?.Mp3Encoder) as Mp3EncoderCtor);
    encoderPromise.catch(() => { encoderPromise = null; });
  }
  return encoderPromise;
}

const toInt16 = (f: Float32Array): Int16Array => {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i])); o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return o;
};

export async function compressAudio(file: File, kbps = 128, onProgress?: (ratio: number) => void): Promise<CompressResult> {
  const before = file.size;
  const Enc = await loadEncoder();
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  let buf: AudioBuffer;
  try { buf = await ctx.decodeAudioData(await file.arrayBuffer()); } finally { ctx.close().catch(() => {}); }

  // lamejs надёжно работает на 44.1/48/32 кГц — остальное приводим к 44.1
  let rate = buf.sampleRate;
  if (![32000, 44100, 48000].includes(rate)) {
    const off = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(buf.duration * 44100), 44100);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    buf = await off.startRendering(); rate = 44100;
  }
  const ch = Math.min(2, buf.numberOfChannels);
  const left = toInt16(buf.getChannelData(0));
  const right = ch === 2 ? toInt16(buf.getChannelData(1)) : undefined;
  const enc = new Enc(ch, rate, ch === 1 ? Math.min(kbps, 96) : kbps);

  const parts: BlobPart[] = [];
  const STEP = 1152 * 20;
  for (let i = 0; i < left.length; i += STEP) {
    const out = right ? enc.encodeBuffer(left.subarray(i, i + STEP), right.subarray(i, i + STEP)) : enc.encodeBuffer(left.subarray(i, i + STEP));
    if (out.length) parts.push(new Uint8Array(out));
    if ((i / STEP) % 25 === 0) { onProgress?.(i / left.length); await new Promise((r) => setTimeout(r)); } // отдаём управление браузеру
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  onProgress?.(1);

  const blob = new Blob(parts, { type: "audio/mpeg" });
  if (blob.size >= before * 0.95) return { file, before, after: before, compressed: false }; // не выиграли — оставляем оригинал
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".mp3", { type: "audio/mpeg" }), before, after: blob.size, compressed: true };
}

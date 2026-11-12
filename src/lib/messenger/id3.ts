/** Минимальный разбор ID3v2.3/2.4 из mp3: название, исполнитель, встроенная обложка. Для других форматов вернёт пусто. */
export interface Id3Info { title?: string; artist?: string; cover?: { mime: string; data: Uint8Array } }

const syncsafe = (b: Uint8Array, o: number) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function decode(enc: number, b: Uint8Array): string {
  try {
    if (enc === 1) {
      const le = b[0] === 0xff && b[1] === 0xfe;
      return new TextDecoder(le ? "utf-16le" : "utf-16be").decode(b[0] === 0xff || b[0] === 0xfe ? b.subarray(2) : b);
    }
    if (enc === 2) return new TextDecoder("utf-16be").decode(b);
    if (enc === 3) return new TextDecoder("utf-8").decode(b);
    // «Latin-1» — на практике русские теги часто в windows-1251
    try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1251").decode(b); }
  } catch { return ""; }
}
const clean = (s: string) => s.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();

export async function readId3(file: File): Promise<Id3Info> {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
    const ver = head[3];
    if (ver !== 3 && ver !== 4) return {};
    const size = Math.min(syncsafe(head, 6), 8 * 1024 * 1024);
    const buf = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
    const out: Id3Info = {};
    let p = 0;
    while (p + 10 <= buf.length) {
      const id = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const len = ver === 4 ? syncsafe(buf, p + 4) : be32(buf, p + 4);
      const body = buf.subarray(p + 10, p + 10 + len);
      p += 10 + len;
      if (!body.length) continue;
      if (id === "TIT2" || id === "TPE1") {
        const t = clean(decode(body[0], body.subarray(1)));
        if (t) { if (id === "TIT2") out.title = t; else out.artist = t; }
      } else if (id === "APIC" && !out.cover) {
        const enc = body[0];
        let i = 1;
        while (i < body.length && body[i] !== 0) i++;
        const mime = String.fromCharCode(...body.subarray(1, i)).toLowerCase();
        i += 2; // нулевой байт и тип картинки
        // описание: оканчивается нулём (для UTF-16 — двумя нулями)
        if (enc === 1 || enc === 2) { while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2; i += 2; }
        else { while (i < body.length && body[i] !== 0) i++; i += 1; }
        const data = body.subarray(i);
        const isJpg = data[0] === 0xff && data[1] === 0xd8;
        const isPng = data[0] === 0x89 && data[1] === 0x50;
        if (data.length > 500 && (isJpg || isPng)) out.cover = { mime: isPng ? "image/png" : "image/jpeg", data: new Uint8Array(data) };
      }
    }
    return out;
  } catch { return {}; }
}

/** Простая обложка, если в файле своей нет: градиент по названию + текст. */
export function makeCover(title: string, artist: string): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 600;
      const g = c.getContext("2d")!;
      let h = 0;
      for (const ch of title + artist) h = (h * 31 + ch.charCodeAt(0)) % 360;
      const grad = g.createLinearGradient(0, 0, 600, 600);
      grad.addColorStop(0, `hsl(${h},70%,48%)`);
      grad.addColorStop(1, `hsl(${(h + 55) % 360},75%,28%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 600, 600);
      g.fillStyle = "rgba(255,255,255,0.14)";
      g.beginPath(); g.arc(470, 130, 150, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff";
      g.font = "700 40px system-ui, sans-serif";
      g.textBaseline = "alphabetic";
      const words = title.split(" ");
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        if (g.measureText(`${cur} ${w}`.trim()).width > 500 && cur) { lines.push(cur); cur = w; } else cur = `${cur} ${w}`.trim();
      }
      if (cur) lines.push(cur);
      const shown = lines.slice(0, 4);
      let y = 420 - (shown.length - 1) * 48;
      for (const l of shown) { g.fillText(l, 50, y); y += 48; }
      g.font = "500 28px system-ui, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillText(artist.slice(0, 32), 50, 540);
      c.toBlob((b) => resolve(b ? new File([b], "cover.jpg", { type: "image/jpeg" }) : null), "image/jpeg", 0.85);
    } catch { resolve(null); }
  });
}

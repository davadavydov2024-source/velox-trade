import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/adminGuard";
import { gunzipSync } from "zlib";

export const runtime = "nodejs";
const MAX = 512 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/webm": "webm" };

function signatureOk(type: string, b: Uint8Array): boolean {
  const sw = (...v: number[]) => v.every((x, i) => b[i] === x);
  if (type === "image/png") return sw(0x89, 0x50, 0x4e, 0x47);
  if (type === "image/gif") return sw(0x47, 0x49, 0x46, 0x38);
  if (type === "image/webp") return sw(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  if (type === "video/webm") return sw(0x1a, 0x45, 0xdf, 0xa3);
  return false;
}

/** multipart: file + slug -> { url, kind? }. PNG/WEBP/GIF/WEBM до 512 КБ и .tgs (анимированные стикеры Telegram → Lottie). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const form = await req.formData();
  const file = form.get("file");
  const slug = String(form.get("slug") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  if (!/^[a-z0-9_]{3,32}$/.test(slug)) return NextResponse.json({ error: "Некорректный slug набора" }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Нет BLOB_READ_WRITE_TOKEN" }, { status: 500 });

  // .tgs (анимированный стикер Telegram) = gzip(Lottie JSON): распаковываем и храним как .json
  if (/\.tgs$/i.test(file.name)) {
    if (file.size > 400 * 1024) return NextResponse.json({ error: ".tgs больше 400 КБ" }, { status: 400 });
    try {
      const raw = Buffer.from(await file.arrayBuffer());
      if (raw[0] !== 0x1f || raw[1] !== 0x8b) throw new Error("not gzip");
      const json = gunzipSync(raw);
      if (json.length > 1_500_000) return NextResponse.json({ error: "Анимация слишком тяжёлая после распаковки" }, { status: 400 });
      JSON.parse(json.toString("utf8"));
      const blob = await put(`messenger-stickers/${slug}/${Date.now()}_${randomBytes(5).toString("hex")}.json`, json, { access: "public", contentType: "application/json" });
      return NextResponse.json({ url: blob.url, kind: "lottie" });
    } catch {
      return NextResponse.json({ error: "Не удалось прочитать .tgs (нужен анимированный стикер Telegram)" }, { status: 400 });
    }
  }

  if (!(file.type in EXT)) return NextResponse.json({ error: "Только PNG, WEBP, GIF, WEBM или TGS" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Стикер больше 512 КБ" }, { status: 400 });
  if (!signatureOk(file.type, new Uint8Array(await file.slice(0, 16).arrayBuffer()))) return NextResponse.json({ error: "Содержимое файла не совпадает с типом" }, { status: 400 });
  const blob = await put(`messenger-stickers/${slug}/${Date.now()}_${randomBytes(5).toString("hex")}.${EXT[file.type]}`, file, { access: "public", contentType: file.type });
  return NextResponse.json({ url: blob.url });
}

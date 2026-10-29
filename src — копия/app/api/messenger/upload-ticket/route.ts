import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger, signingSecret } from "@/lib/messenger/server";
import { UPLOAD_KINDS, UploadKind } from "@/lib/messenger/uploads";

export const runtime = "nodejs";

/**
 * POST { kind } -> { ticket, pathPrefix, maxBytes, contentTypes }.
 * Дальше клиент грузит файл НАПРЯМУЮ в Vercel Blob (так проходят видео до 25 МБ — через обычный API лимит тела 4,5 МБ):
 *   import { upload } from "@vercel/blob/client";
 *   const blob = await upload(`${pathPrefix}${Date.now()}.webm`, file, { access: "public", handleUploadUrl: "/api/messenger/upload", clientPayload: ticket });
 * blob.url потом передаётся в send / stories / profile.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const secret = signingSecret();
  if (!secret) return fail("Не настроено хранилище файлов (BLOB_READ_WRITE_TOKEN)", 503);
  if (!(await rateLimit(`msgr_upload_${me.uid}`, 60, 60 * 60_000))) return fail("Слишком много загрузок, попробуй позже", 429);
  const { kind } = await req.json().catch(() => ({}));
  if (typeof kind !== "string" || !(kind in UPLOAD_KINDS)) return fail("Неизвестный тип загрузки");
  const exp = Date.now() + 5 * 60_000;
  const body = `${me.uid}.${kind}.${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  const cfg = UPLOAD_KINDS[kind as UploadKind];
  return NextResponse.json({ ticket: `${body}.${sig}`, pathPrefix: `messenger/${me.uid}/`, maxBytes: cfg.max, contentTypes: cfg.types });
}

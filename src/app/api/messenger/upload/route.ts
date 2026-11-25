import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { safeEqual, signingSecret } from "@/lib/messenger/server";
import { UPLOAD_KINDS, UploadKind } from "@/lib/messenger/uploads";

export const runtime = "nodejs";

function verifyTicket(raw: string | null): { uid: string; kind: UploadKind } | null {
  const secret = signingSecret();
  if (!secret || !raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [uid, kind, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() || !(kind in UPLOAD_KINDS)) return null;
  const expected = createHmac("sha256", secret).update(`${uid}.${kind}.${exp}`).digest("hex");
  return safeEqual(sig, expected) ? { uid, kind: kind as UploadKind } : null;
}

/** Обработчик клиентской загрузки в Vercel Blob. Требует билет из /api/messenger/upload-ticket в clientPayload. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const t = verifyTicket(clientPayload);
        if (!t) throw new Error("Нет прав на загрузку");
        if (!pathname.startsWith(`messenger/${t.uid}/`) || pathname.includes("..")) throw new Error("Неверный путь загрузки");
        const cfg = UPLOAD_KINDS[t.kind];
        return { allowedContentTypes: cfg.types, maximumSizeInBytes: cfg.max, addRandomSuffix: true, tokenPayload: JSON.stringify({ uid: t.uid }) };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Не удалось загрузить" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { generateBase32Secret, buildOtpauthUrl } from "@/lib/totp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const db = adminDb();
    const secretRef = db.collection("twoFactorSecrets").doc(uid);
    const existing = await secretRef.get();
    if (existing.exists && existing.data()?.enabled) {
      return NextResponse.json({ error: "Двухфакторная аутентификация уже включена" }, { status: 400 });
    }

    // Новый секрет при каждом заходе на экран настройки — если человек не завершит подтверждение
    // старым, он просто перезапишется, ничего страшного (secret недействителен, пока не enabled).
    const secret = generateBase32Secret();
    await secretRef.set({ secret, enabled: false, createdAt: Date.now() }, { merge: true });

    const accountLabel = decoded.email || uid;
    const otpauthUrl = buildOtpauthUrl(secret, accountLabel);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

    return NextResponse.json({ secret, otpauthUrl, qrDataUrl });
  } catch (err) {
    console.error("2fa/setup error:", err);
    return NextResponse.json({ error: "Не удалось начать настройку 2FA" }, { status: 500 });
  }
}

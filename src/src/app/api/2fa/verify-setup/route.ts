import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/lib/totp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const { code } = await req.json();
    if (typeof code !== "string") return NextResponse.json({ error: "Код обязателен" }, { status: 400 });

    const db = adminDb();
    const secretRef = db.collection("twoFactorSecrets").doc(uid);
    const snap = await secretRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Сначала запусти настройку 2FA заново" }, { status: 400 });
    const { secret } = snap.data() as { secret: string };

    if (!verifyTotpCode(secret, code)) {
      return NextResponse.json({ error: "Неверный код. Проверь время на телефоне и попробуй снова." }, { status: 400 });
    }

    const backupCodes = generateBackupCodes();
    const backupCodeHashes = backupCodes.map(hashBackupCode);
    await secretRef.set({ enabled: true, backupCodeHashes, usedBackupCodeHashes: [], confirmedAt: Date.now() }, { merge: true });
    await db.collection("users").doc(uid).set({ twoFactorEnabled: true }, { merge: true });

    return NextResponse.json({ ok: true, backupCodes });
  } catch (err) {
    console.error("2fa/verify-setup error:", err);
    return NextResponse.json({ error: "Не удалось подтвердить код" }, { status: 500 });
  }
}

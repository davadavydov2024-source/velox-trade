import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { verifyTotpCode, hashBackupCode } from "@/lib/totp";

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
    const db = adminDb();
    const secretRef = db.collection("twoFactorSecrets").doc(uid);
    const snap = await secretRef.get();
    if (!snap.exists || !snap.data()?.enabled) {
      return NextResponse.json({ error: "2FA и так не включена" }, { status: 400 });
    }
    const data = snap.data() as { secret: string; backupCodeHashes: string[] };

    const validTotp = typeof code === "string" && verifyTotpCode(data.secret, code);
    const validBackup = typeof code === "string" && data.backupCodeHashes.includes(hashBackupCode(code));
    if (!validTotp && !validBackup) {
      return NextResponse.json({ error: "Неверный код — для отключения 2FA нужен текущий код из приложения" }, { status: 400 });
    }

    await secretRef.delete();
    await db.collection("users").doc(uid).set({ twoFactorEnabled: false }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("2fa/disable error:", err);
    return NextResponse.json({ error: "Не удалось отключить 2FA" }, { status: 500 });
  }
}

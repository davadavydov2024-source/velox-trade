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
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Введи код" }, { status: 400 });
    }

    const db = adminDb();
    const secretRef = db.collection("twoFactorSecrets").doc(uid);
    const snap = await secretRef.get();
    if (!snap.exists || !snap.data()?.enabled) {
      // 2FA не включена — считаем, что проверять нечего (гейт на клиенте и так его не должен был показать).
      return NextResponse.json({ ok: true });
    }
    const data = snap.data() as { secret: string; backupCodeHashes: string[]; usedBackupCodeHashes?: string[] };

    if (verifyTotpCode(data.secret, code)) {
      return NextResponse.json({ ok: true });
    }

    // Не подошло как TOTP — пробуем как одноразовый резервный код.
    const hash = hashBackupCode(code);
    const used = data.usedBackupCodeHashes ?? [];
    if (data.backupCodeHashes.includes(hash) && !used.includes(hash)) {
      await secretRef.update({ usedBackupCodeHashes: [...used, hash] });
      return NextResponse.json({ ok: true, usedBackupCode: true });
    }

    return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  } catch (err) {
    console.error("2fa/verify-login error:", err);
    return NextResponse.json({ error: "Не удалось проверить код" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Шаг 2: проверяем, появился ли выданный код в описании профиля Roblox — тоже читаем только
 * публичное поле description через users.roblox.com, без какой-либо аутентификации на стороне
 * Roblox. Если код нашёлся — привязка подтверждена, можно убирать код из описания обратно.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const db = adminDb();
    const verifRef = db.collection("robloxVerifications").doc(decoded.uid);
    const verifSnap = await verifRef.get();
    if (!verifSnap.exists) return NextResponse.json({ error: "Сначала начни привязку — укажи свой Roblox-ник" }, { status: 404 });

    const verif = verifSnap.data() as {
      code: string;
      robloxUserId: number;
      robloxUsername: string;
      robloxDisplayName: string;
      avatarUrl: string | null;
      createdAt: number;
    };

    // Код действителен 30 минут — не бессрочно, чтобы старые незавершённые попытки не висели вечно.
    if (Date.now() - verif.createdAt > 30 * 60 * 1000) {
      await verifRef.delete();
      return NextResponse.json({ error: "Код устарел, начни привязку заново" }, { status: 410 });
    }

    const profileRes = await fetch(`https://users.roblox.com/v1/users/${verif.robloxUserId}`);
    if (!profileRes.ok) return NextResponse.json({ error: "Roblox временно недоступен, попробуй позже" }, { status: 502 });
    const profile = await profileRes.json();
    const description: string = profile?.description ?? "";

    if (!description.includes(verif.code)) {
      return NextResponse.json({ error: "Код не найден в описании профиля — проверь, что сохранил изменения на Roblox" }, { status: 400 });
    }

    // Один Roblox-аккаунт — один сайт-аккаунт: если этот Roblox уже привязан к другому uid,
    // отвязываем его там (иначе будет путаница, к кому реально относится ник в системе выдачи).
    const existingLinkSnap = await db.collection("robloxLinks").where("robloxUserId", "==", verif.robloxUserId).get();
    const batch = db.batch();
    existingLinkSnap.docs.forEach((doc) => {
      if (doc.id !== decoded.uid) batch.delete(doc.ref);
    });

    const linkRef = db.collection("robloxLinks").doc(decoded.uid);
    batch.set(linkRef, {
      uid: decoded.uid,
      robloxUserId: verif.robloxUserId,
      robloxUsername: verif.robloxUsername,
      robloxDisplayName: verif.robloxDisplayName,
      avatarUrl: verif.avatarUrl,
      verifiedAt: Date.now(),
    });
    batch.delete(verifRef);
    await batch.commit();

    return NextResponse.json({
      ok: true,
      robloxUsername: verif.robloxUsername,
      robloxDisplayName: verif.robloxDisplayName,
      avatarUrl: verif.avatarUrl,
    });
  } catch (err) {
    console.error("roblox/verify/confirm error:", err);
    return NextResponse.json({ error: "Не удалось проверить привязку" }, { status: 500 });
  }
}

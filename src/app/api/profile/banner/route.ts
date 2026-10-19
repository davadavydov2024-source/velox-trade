import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { isAdminUid } from "@/lib/users";

export const runtime = "nodejs";

/**
 * Баннер профиля может поставить любой залогиненный пользователь — но только СЕБЕ (uid берётся
 * из токена, не из тела запроса). Запись идёт только через этот роут: в правилах Firestore
 * bannerURL должен быть закрыт для прямой записи с клиента, иначе в обход проверки ниже можно
 * поставить любую ссылку.
 * Не-админ может указать только картинку, загруженную через наш /api/blob/upload (Vercel Blob);
 * админу разрешена любая https-ссылка, как и раньше.
 * Тело: { bannerURL: string | null } — null убирает баннер.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { bannerURL?: string | null };
    const raw = body.bannerURL;
    if (raw !== null && typeof raw !== "string") {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    let bannerURL: string | null = null;
    if (typeof raw === "string" && raw.trim() !== "") {
      const url = raw.trim();
      if (url.length > 1000 || !/^https:\/\//i.test(url)) {
        return NextResponse.json({ error: "Ссылка на баннер должна начинаться с https://" }, { status: 400 });
      }
      if (!isAdminUid(decoded.uid)) {
        let host = "";
        try {
          host = new URL(url).hostname;
        } catch {
          return NextResponse.json({ error: "Неверная ссылка на баннер" }, { status: 400 });
        }
        if (!host.endsWith(".public.blob.vercel-storage.com")) {
          return NextResponse.json({ error: "Загрузи картинку через кнопку «Добавить баннер»" }, { status: 400 });
        }
      }
      bannerURL = url;
    }

    await adminDb().collection("users").doc(decoded.uid).update({ bannerURL });
    return NextResponse.json({ ok: true, bannerURL });
  } catch (err) {
    console.error("profile/banner error:", err);
    return NextResponse.json({ error: "Не удалось сохранить баннер" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/**
 * Баннер профиля может поставить любой пользователь, но только себе. Проверка именно на сервере
 * (токен + список NEXT_PUBLIC_ADMIN_UIDS) — скрытой на клиенте кнопки недостаточно: иначе любой
 * мог бы записать bannerURL в свой документ напрямую.
 * Тело: { bannerURL: string | null } — null убирает баннер.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const userSnap = await adminDb().collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    if (userSnap.data()?.banned) return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });

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
      // Принимаем только файлы из нашего хранилища (загруженные через /api/blob/upload), а не любые
      // внешние ссылки — иначе в баннер можно подставить чужой трекер или нежелательную картинку.
      let host = "";
      try { host = new URL(url).hostname; } catch { /* неверный URL */ }
      if (!host.endsWith(".public.blob.vercel-storage.com")) {
        return NextResponse.json({ error: "Загрузи картинку через кнопку, внешние ссылки не принимаются" }, { status: 400 });
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

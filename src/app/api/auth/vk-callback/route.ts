import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const VK_CLIENT_ID = process.env.NEXT_PUBLIC_VK_CLIENT_ID;
const VK_CLIENT_SECRET = process.env.VK_CLIENT_SECRET;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

function siteUrl(req: NextRequest): string {
  return SITE_URL || req.nextUrl.origin;
}

function randomCode(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

/**
 * VK перенаправляет сюда браузер пользователя после того, как он разрешил вход (?code=...).
 * Дальше — стандартный OAuth-обмен кода на access_token на сервере (нужен client_secret,
 * поэтому это не может происходить в браузере), находим/создаём аккаунт и отправляем
 * пользователя на страницу, которая завершит вход на клиенте.
 */
export async function GET(req: NextRequest) {
  const base = siteUrl(req);
  const code = req.nextUrl.searchParams.get("code");
  const vkError = req.nextUrl.searchParams.get("error_description") || req.nextUrl.searchParams.get("error");

  if (vkError) {
    return NextResponse.redirect(`${base}/auth/login?vkError=${encodeURIComponent(vkError)}`);
  }
  if (!code || !VK_CLIENT_ID || !VK_CLIENT_SECRET) {
    return NextResponse.redirect(`${base}/auth/login?vkError=${encodeURIComponent("Вход через VK не настроен")}`);
  }

  try {
    const redirectUri = `${base}/api/auth/vk-callback`;

    const tokenRes = await fetch(
      `https://oauth.vk.com/access_token?client_id=${VK_CLIENT_ID}&client_secret=${VK_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token || !tokenData.user_id) {
      console.error("vk-callback: обмен кода не удался", tokenData);
      return NextResponse.redirect(`${base}/auth/login?vkError=${encodeURIComponent("Не удалось войти через VK")}`);
    }

    const vkUserId: number = tokenData.user_id;
    const vkEmail: string | undefined = tokenData.email;

    const profileRes = await fetch(
      `https://api.vk.com/method/users.get?user_ids=${vkUserId}&fields=photo_200&access_token=${tokenData.access_token}&v=5.131`
    );
    const profileData = await profileRes.json();
    const vkProfile = profileData?.response?.[0];
    const displayName = vkProfile ? `${vkProfile.first_name} ${vkProfile.last_name}`.trim() : "Игрок VK";
    const photoURL: string | undefined = vkProfile?.photo_200;

    const uid = `vk_${vkUserId}`;
    const auth = adminAuth();
    try {
      await auth.getUser(uid);
    } catch {
      await auth.createUser({
        uid,
        displayName,
        photoURL,
        ...(vkEmail ? { email: vkEmail } : {}),
      });
    }

    const token = await auth.createCustomToken(uid);

    // Не кладём сам custom token в URL (он живёт в истории браузера/логах) — вместо этого
    // одноразовый непрозрачный код, который клиент сразу обменяет на токен через POST.
    const oneTimeCode = randomCode();
    await adminDb()
      .collection("vkLoginTokens")
      .doc(oneTimeCode)
      .set({ token, createdAt: Date.now(), expiresAt: Date.now() + 2 * 60 * 1000 });

    return NextResponse.redirect(`${base}/auth/vk-finish?code=${oneTimeCode}`);
  } catch (err) {
    console.error("vk-callback error:", err);
    return NextResponse.redirect(`${base}/auth/login?vkError=${encodeURIComponent("Не удалось войти через VK")}`);
  }
}

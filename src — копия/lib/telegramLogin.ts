import { adminAuth, adminDb } from "./firebaseAdmin";

export interface TelegramIdentity {
  id: number | string; // Telegram user id
  name?: string;
  username?: string | null;
  photoUrl?: string | null;
}

/**
 * Находит или создаёт аккаунт сайта по Telegram id и возвращает custom-токен Firebase.
 * Общая логика для обоих способов входа через Telegram (старый виджет и новый OIDC) — аккаунты
 * совпадают: тот же telegram id всегда ведёт в один и тот же профиль, а также в профиль, который
 * раньше создал бот-с-кодами (см. api/telegram/webhook).
 */
export async function loginWithTelegramIdentity(identity: TelegramIdentity): Promise<{ token: string; uid: string; isNew: boolean }> {
  const db = adminDb();
  const auth = adminAuth();
  const telegramId = String(identity.id);
  const displayName = (identity.name ?? "").trim() || "Игрок";
  const photoURL = identity.photoUrl ?? undefined;

  const widgetLinkRef = db.collection("telegramWidgetLinks").doc(telegramId);
  const widgetLinkSnap = await widgetLinkRef.get();

  let uid: string;
  let isNew = false;
  if (widgetLinkSnap.exists) {
    uid = (widgetLinkSnap.data() as { uid: string }).uid;
  } else {
    // Firebase Auth не знает Telegram как провайдера — используем synthetic email telegram_<id>@telegram.local.
    const syntheticEmail = `telegram_${telegramId}@telegram.local`;
    try {
      const existing = await auth.getUserByEmail(syntheticEmail);
      uid = existing.uid;
    } catch {
      const created = await auth.createUser({ email: syntheticEmail, displayName, photoURL });
      uid = created.uid;
      isNew = true;
      await db.collection("users").doc(uid).set({
        email: syntheticEmail,
        displayName,
        photoURL: photoURL ?? null,
        balance: 0,
        badges: ["user"],
        emailVerified: true, // личность подтвердил Telegram; email синтетический
        banned: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      });
    }
    await widgetLinkRef.set({ uid, telegramUsername: identity.username ?? null, linkedAt: Date.now() });
    // Привязка Telegram — тот же формат, что у бота-с-кодами: /profile/security и рассылки видят аккаунт как привязанный.
    await db
      .collection("telegramLinks")
      .doc(uid)
      .set({ chatId: Number(identity.id), telegramUsername: identity.username ?? null, linkedAt: Date.now() }, { merge: true });
  }

  await db.collection("users").doc(uid).update({ lastLoginAt: Date.now() });
  const token = await auth.createCustomToken(uid);
  return { token, uid, isNew };
}

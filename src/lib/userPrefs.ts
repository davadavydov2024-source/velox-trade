import { adminDb } from "./firebaseAdmin";
import { NotifyPrefs } from "@/types";

/** Настройки уведомлений пользователя (по умолчанию всё включено, у старых профилей поля нет). */
export async function getNotifyPrefs(uid: string): Promise<Required<NotifyPrefs>> {
  try {
    const snap = await adminDb().collection("users").doc(uid).get();
    const p = (snap.data()?.notifyPrefs ?? {}) as NotifyPrefs;
    return { email: p.email !== false, telegram: p.telegram !== false, loginAlerts: p.loginAlerts !== false };
  } catch {
    return { email: true, telegram: true, loginAlerts: true };
  }
}

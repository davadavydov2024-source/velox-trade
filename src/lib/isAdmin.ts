/**
 * Проверка админа по NEXT_PUBLIC_ADMIN_UIDS. Отдельный файл без клиентского Firebase SDK —
 * серверные роуты импортируют отсюда, а не из lib/users.ts.
 */
// Запасной список — те же аккаунты, что вписаны в isAdmin() в firestore.rules. Работает ТОЛЬКО если NEXT_PUBLIC_ADMIN_UIDS пуста.
const DEFAULT_ADMIN_UIDS = ["s4Cbs8BFRwd9CrPYNkQBQzbVlQG3", "DAdWBqr7i8UWc1nT0NVVMuJ1DJQ2"];

export function isAdminUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const list = fromEnv.length ? fromEnv : DEFAULT_ADMIN_UIDS;
  return list.includes(uid);
}

/**
 * Проверка админа по NEXT_PUBLIC_ADMIN_UIDS. Отдельный файл без клиентского Firebase SDK —
 * серверные роуты импортируют отсюда, а не из lib/users.ts.
 */
export function isAdminUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/**
 * Проверка админа по NEXT_PUBLIC_ADMIN_UIDS. Вынесено отдельно от lib/users.ts, чтобы серверные
 * роуты (api/*) не тянули в серверный бандл клиентский Firebase SDK ради одной функции.
 */
export function isAdminUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

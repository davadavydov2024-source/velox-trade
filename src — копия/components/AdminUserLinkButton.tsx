"use client";

import Link from "next/link";
import { UserCog } from "lucide-react";

/**
 * Кнопка "В админку" — переход на /admin/users?uid=<uid>, где страница сама найдёт и подсветит
 * этого пользователя в списке (см. src/app/admin/users/page.tsx). Используется везде, где в
 * админке встречается конкретный пользователь по заявке/обращению: регистрации, поддержка,
 * жалобы, заявки на продажу и на редактирование товара.
 */
export function AdminUserLinkButton({ uid, label = "Профиль" }: { uid: string; label?: string }) {
  return (
    <Link
      href={`/admin/users?uid=${uid}`}
      className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-accent transition-colors shrink-0"
      title="Открыть профиль этого пользователя в «Пользователях»"
    >
      <UserCog size={13} /> {label}
    </Link>
  );
}

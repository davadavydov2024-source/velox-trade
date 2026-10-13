import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Больше не используется: этот роут принимал текст от любого клиента без авторизации и пересылал его админам.
 * Теперь о новой заявке уведомляет сервер по её id (см. lib/telegramAdminNotify.ts → notifyAdminSellRequest;
 * с клиента — /api/notify/admin-event). Файл можно удалить.
 */
export async function POST() {
  return NextResponse.json({ error: "Gone" }, { status: 410 });
}

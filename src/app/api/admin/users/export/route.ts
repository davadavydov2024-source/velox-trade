import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COLUMNS: { key: string; title: string }[] = [
  { key: "uid", title: "UID" },
  { key: "displayName", title: "Ник" },
  { key: "username", title: "Юзернейм" },
  { key: "email", title: "Email" },
  { key: "emailVerified", title: "Email подтверждён" },
  { key: "balance", title: "Баланс, ₽" },
  { key: "starsBalance", title: "Stars" },
  { key: "badges", title: "Метки" },
  { key: "staffRole", title: "Роль персонала" },
  { key: "banned", title: "Заблокирован" },
  { key: "banReason", title: "Причина блокировки" },
  { key: "banUntil", title: "Блокировка до" },
  { key: "createdAt", title: "Регистрация" },
  { key: "lastLoginAt", title: "Последний вход" },
  { key: "lastActiveAt", title: "Последняя активность" },
  { key: "age", title: "Возраст" },
  { key: "language", title: "Язык" },
  { key: "ratingCount", title: "Отзывов" },
  { key: "ratingAvg", title: "Средний рейтинг" },
  { key: "twoFactorEnabled", title: "2FA" },
  { key: "referralCode", title: "Реферальный код" },
  { key: "referredBy", title: "Пригласил (UID)" },
];

function iso(ts: unknown): string {
  return typeof ts === "number" && ts > 0 ? new Date(ts).toISOString() : "";
}

/** CSV-ячейка: экранирование кавычек + защита от «формульных» инъекций при открытии в Excel. */
function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Выгрузка всех пользователей (только админы): ?format=csv (по умолчанию, открывается в Excel) или json.
 * В файл не попадают секреты (ключи 2FA, токены) — только данные профиля. Каждая выгрузка пишется в adminAuditLog.
 */
export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if ("error" in guard) return guard.error;

    const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
    const snap = await adminDb().collection("users").orderBy("createdAt", "desc").get();

    const rows = snap.docs.map((d) => {
      const u = d.data() as Record<string, any>;
      const ratingCount = Number(u.ratingCount ?? 0);
      return {
        uid: d.id,
        displayName: u.displayName ?? "",
        username: u.username ?? "",
        email: u.email ?? "",
        emailVerified: !!u.emailVerified,
        balance: u.balance ?? 0,
        starsBalance: u.starsBalance ?? 0,
        badges: Array.isArray(u.badges) ? u.badges.join(" ") : "",
        staffRole: u.staffRole ?? "",
        banned: !!u.banned,
        banReason: u.banReason ?? "",
        banUntil: u.banUntil === "forever" ? "навсегда" : iso(u.banUntil),
        createdAt: iso(u.createdAt),
        lastLoginAt: iso(u.lastLoginAt),
        lastActiveAt: iso(u.lastActiveAt),
        age: u.age ?? "",
        language: u.language ?? "",
        ratingCount,
        ratingAvg: ratingCount ? Math.round(((u.ratingSum ?? 0) / ratingCount) * 100) / 100 : "",
        twoFactorEnabled: !!u.twoFactorEnabled,
        referralCode: u.referralCode ?? "",
        referredBy: u.referredBy ?? "",
      } as Record<string, unknown>;
    });

    await logAdminAccess(guard.uid, "export_users", { format, count: rows.length });

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="users-${stamp}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Разделитель ";" и BOM — чтобы Excel в русской локали сразу открыл файл с нормальными столбцами и кириллицей.
    const header = COLUMNS.map((c) => csvCell(c.title)).join(";");
    const lines = rows.map((r) => COLUMNS.map((c) => csvCell(r[c.key])).join(";"));
    const body = "\uFEFF" + [header, ...lines].join("\r\n");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="users-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("admin/users/export error:", err);
    return NextResponse.json({ error: "Не удалось выгрузить пользователей" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const CACTUSPAY_TOKEN = process.env.CACTUSPAY_TOKEN;

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const idToken = formData.get("idToken");
    const orderId = formData.get("orderId");
    const file = formData.get("file");

    if (typeof idToken !== "string" || !idToken) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const auth = adminAuth();
    let uid: string;
    try {
      uid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Недействительный токен" }, { status: 401 });
    }
    if (!isAdminUid(uid)) {
      return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });
    }

    if (typeof orderId !== "string" || !orderId) {
      return NextResponse.json({ error: "Не указан order_id" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }
    if (!CACTUSPAY_TOKEN) {
      return NextResponse.json({ error: "CACTUSPAY_TOKEN не задан на сервере" }, { status: 500 });
    }

    const forward = new FormData();
    forward.append("token", CACTUSPAY_TOKEN);
    forward.append("order_id", orderId);
    forward.append("file", file);

    const res = await fetch("https://lk.cactuspay.pro/api/receipt", { method: "POST", body: forward });
    const data = await res.json();

    if (data.status !== "success") {
      return NextResponse.json({ error: data.response || "Ошибка отправки чека" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("payments/receipt error:", err);
    return NextResponse.json({ error: "Не удалось отправить чек" }, { status: 500 });
  }
}

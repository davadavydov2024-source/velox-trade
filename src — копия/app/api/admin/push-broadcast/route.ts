import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { sendWebPushBroadcast } from "@/lib/webPushServer";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
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

    const { title, body, url } = await req.json();
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Заголовок обязателен" }, { status: 400 });
    }

    const result = await sendWebPushBroadcast({ title: title.trim(), body: (body ?? "").trim(), url: url || undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("push-broadcast error:", err);
    return NextResponse.json({ error: "Не удалось выполнить рассылку" }, { status: 500 });
  }
}

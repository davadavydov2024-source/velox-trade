import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { createAndPublishContest } from "@/lib/telegramContests";
import { deleteTelegramMessage } from "@/lib/telegramBot";
import { TelegramContest, TelegramContestEntry } from "@/types";

export const runtime = "nodejs";
// Роут читает Authorization из request.headers, поэтому Next пытается собрать его статически при
// билде и падает с "Dynamic server usage" (см. лог деплоя) — принудительно делаем роут динамическим.
export const dynamic = "force-dynamic";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/** Отдаёт все конкурсы (активные и завершённые) вместе со списком участников каждого — для
 * /admin/contests, где админ вручную решает, когда подводить итоги (см. api/admin/contests/finish). */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

    const db = adminDb();
    const contestsSnap = await db.collection("telegramContests").orderBy("createdAt", "desc").get();
    const contests = contestsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as TelegramContest);

    const withEntries = await Promise.all(
      contests.map(async (contest) => {
        const entriesSnap = await db.collection("telegramContestEntries").where("contestId", "==", contest.id).get();
        const entries = entriesSnap.docs.map((d) => d.data() as TelegramContestEntry).sort((a, b) => a.joinedAt - b.joinedAt);
        return { ...contest, entries };
      })
    );

    return NextResponse.json({ contests: withEntries });
  } catch (err) {
    console.error("admin/contests GET error:", err);
    return NextResponse.json({ error: "Не удалось загрузить конкурсы" }, { status: 500 });
  }
}

/** Создание конкурса прямо с сайта (/admin/contests) — раньше это можно было сделать только
 * через мастер в самом Telegram-боте. Публикует пост в указанном канале так же, как и бот. */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

    const body = await req.json();
    const winnersCount = Number(body.winnersCount);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const buttonText = typeof body.buttonText === "string" ? body.buttonText.trim() : "";
    const buttonColor = typeof body.buttonColor === "string" ? body.buttonColor : "default";
    const photoUrl = typeof body.photoUrl === "string" && body.photoUrl ? body.photoUrl : undefined;
    const channelIdRaw = typeof body.channelId === "string" ? body.channelId.trim() : "";

    if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 50) {
      return NextResponse.json({ error: "Число победителей должно быть целым от 1 до 50" }, { status: 400 });
    }
    if (!text) return NextResponse.json({ error: "Текст конкурса не может быть пустым" }, { status: 400 });
    if (!buttonText) return NextResponse.json({ error: "Текст кнопки не может быть пустым" }, { status: 400 });
    if (!channelIdRaw) return NextResponse.json({ error: "Укажи канал" }, { status: 400 });

    const channelId = channelIdRaw.startsWith("@") || channelIdRaw.startsWith("-") ? channelIdRaw : `@${channelIdRaw}`;

    const result = await createAndPublishContest({
      // 0 — метка "создано с сайта, а не через бота" (у создателя нет своего chat_id, см. тип
      // TelegramContest.createdByAdminChatId и комментарий в lib/telegramContests.ts).
      createdByAdminChatId: 0,
      winnersCount,
      photoUrl,
      text,
      buttonText,
      buttonColor,
      channelId,
    });

    if (!result.success) return NextResponse.json({ error: result.message }, { status: 502 });
    return NextResponse.json({ ok: true, contestId: result.contestId });
  } catch (err) {
    console.error("admin/contests POST error:", err);
    return NextResponse.json({ error: "Не удалось создать конкурс" }, { status: 500 });
  }
}

/** Удаление конкурса из /admin/contests — стирает и запись в базе, и сам пост в канале (если он
 * ещё существует), и все записи участников. Работает для конкурсов в любом статусе — активных
 * (просто отменяет розыгрыш) и уже завершённых (уборка истории). */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

    const contestId = req.nextUrl.searchParams.get("id");
    if (!contestId) return NextResponse.json({ error: "Не указан id конкурса" }, { status: 400 });

    const db = adminDb();
    const contestRef = db.collection("telegramContests").doc(contestId);
    const contestSnap = await contestRef.get();
    if (!contestSnap.exists) return NextResponse.json({ error: "Конкурс не найден" }, { status: 404 });
    const contest = contestSnap.data() as TelegramContest;

    // messageId === -1 — метка "пост с фото, id сообщения не сохранён" (см. sendPhotoToChannelAndGetId
    // в lib/telegramContests.ts) — удалить его отсюда нечем, просто пропускаем это без ошибки.
    if (contest.messageId && contest.messageId > 0) {
      await deleteTelegramMessage(contest.channelId, contest.messageId);
    }

    const entriesSnap = await db.collection("telegramContestEntries").where("contestId", "==", contestId).get();
    const batch = db.batch();
    entriesSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(contestRef);
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin/contests DELETE error:", err);
    return NextResponse.json({ error: "Не удалось удалить конкурс" }, { status: 500 });
  }
}

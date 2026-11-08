import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_MILIGRAM_CONFIG, MiliGramConfig } from "@/lib/miligram";

export const runtime = "nodejs";
// Без этого Next пытался собрать ответ ВО ВРЕМЯ СБОРКИ (читая Firestore) — при исчерпанной квоте сборка падала. Теперь считается только по запросу.
export const dynamic = "force-dynamic";

/** Публичный конфиг для приложения MiliGram: флаги функций, минимальная версия, объявление. Без токена. */
export async function GET() {
  let data: Partial<MiliGramConfig> = {};
  try {
    data = ((await adminDb().collection("settings").doc("miligram").get()).data() ?? {}) as Partial<MiliGramConfig>;
  } catch (err) {
    // Firestore недоступен или кончилась квота — отдаём значения по умолчанию, чтобы приложение не падало
    console.error("miligram/config:", (err as Error)?.message);
  }
  const flags = { ...DEFAULT_MILIGRAM_CONFIG.flags, ...(data.flags ?? {}) };
  const a = data.announcement;
  return NextResponse.json(
    { flags, minVersion: data.minVersion ?? "", announcement: a?.active ? { id: a.id, text: a.text } : null },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}

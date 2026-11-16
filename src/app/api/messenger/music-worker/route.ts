import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/adminGuard";
import { isMusicWorker } from "@/lib/messenger/musicWorkers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — является ли текущий пользователь помощником по музыке (админ тоже может добавлять). */
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if ("error" in u) return u.error;
  return NextResponse.json({ worker: u.isAdmin || (await isMusicWorker(u.uid)) });
}

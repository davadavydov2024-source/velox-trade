import { NextResponse } from "next/server";
import { getLatestRelease } from "@/lib/messenger/releases";

export const revalidate = 600;

/** Последний релиз приложений (версия, ссылки, размеры) — для раздела «Приложения» в настройках мессенджера. */
export async function GET() {
  const rel = await getLatestRelease();
  return NextResponse.json({ release: rel });
}

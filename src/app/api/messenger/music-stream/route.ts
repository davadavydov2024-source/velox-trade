import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Прокси для песен: у части пользователей домен *.public.blob.vercel-storage.com не открывается (блокировка/сбои провайдера),
 * а сам сайт открывается. Плеер в таком случае берёт песню отсюда: GET /api/messenger/music-stream?u=<https-ссылка на файл>.
 * <audio> не умеет слать заголовок авторизации, поэтому доступ не по токену, а по строгому белому списку:
 * только наш Vercel Blob, только папка /messenger/ и только аудио-расширения. Диапазоны (Range) пробрасываются — перемотка работает.
 */
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|webm|flac)$/i;

function bad(status: number, msg: string) {
  return new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return bad(400, "bad url");
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com") || url.username || url.password || url.port) return bad(400, "host not allowed");
  if (!url.pathname.startsWith("/messenger/") || !AUDIO_EXT.test(url.pathname)) return bad(400, "path not allowed");

  const headers: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.range = range;

  let up: Response;
  try {
    up = await fetch(url.toString(), { headers, redirect: "error", signal: AbortSignal.timeout(50_000) });
  } catch {
    return bad(502, "upstream unavailable");
  }
  if (!up.ok && up.status !== 206) return bad(up.status === 404 ? 404 : 502, "upstream error");

  const out = new Headers();
  const type = up.headers.get("content-type") ?? "";
  out.set("content-type", type.startsWith("audio/") ? type : "audio/mpeg");
  for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
    const v = up.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("accept-ranges", "bytes");
  // имена файлов в Blob уникальны (случайный суффикс), содержимое не меняется — можно кэшировать надолго
  out.set("cache-control", "public, max-age=31536000, immutable");
  out.set("x-content-type-options", "nosniff");
  return new Response(up.body, { status: up.status, headers: out });
}

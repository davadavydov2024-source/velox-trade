import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // неделя — чужие страницы редко меняют og-теги чаще
const MAX_BYTES = 220_000; // читаем только «голову» страницы — этого достаточно для <head>

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function metaContent(html: string, attr: "property" | "name", key: string): string | undefined {
  const re1 = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`, "i");
  const m = html.match(re1) ?? html.match(re2);
  return m ? decodeEntities(m[1]).trim() || undefined : undefined;
}

/** Достаём og:title/description/image из <head> простыми регэксами — полноценный HTML-парсер тут не нужен. */
function extract(html: string, pageUrl: string): LinkPreview {
  const head = html.slice(0, html.toLowerCase().indexOf("</head>") + 7 || html.length) || html;
  const title = metaContent(head, "property", "og:title") ?? decodeEntities(head.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "").trim() || undefined;
  const description = metaContent(head, "property", "og:description") ?? metaContent(head, "name", "description");
  let image = metaContent(head, "property", "og:image");
  if (image) {
    try { image = new URL(image, pageUrl).toString(); } catch { image = undefined; }
    if (image && !/^https:\/\//i.test(image)) image = undefined; // грузим в <img> только https
  }
  const siteName = metaContent(head, "property", "og:site_name");
  return { url: pageUrl, title, description, image, siteName };
}

function hashUrl(u: string): string {
  let h = 0;
  for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Блокируем внутренние/локальные адреса — иначе превью можно превратить в сканер внутренней сети (SSRF). */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local")) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

/** GET ?url=... — превью ссылки (заголовок/описание/картинка) для показа под сообщением, как в Telegram. Кэш в messengerLinkPreviews на неделю. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;

  const raw = req.nextUrl.searchParams.get("url") ?? "";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) return NextResponse.json({ error: "blocked" }, { status: 400 });
  if (!(await rateLimit(`msgr_linkprev_${me.uid}`, 40, 60_000))) return NextResponse.json({ error: "Слишком часто" }, { status: 429 });

  const id = hashUrl(u.toString());
  const ref = adminDb().collection("messengerLinkPreviews").doc(id);
  try {
    const cached = await ref.get();
    const cd = cached.data() as { at?: number; empty?: boolean; preview?: LinkPreview } | undefined;
    if (cd && Date.now() - (cd.at ?? 0) < CACHE_TTL) return NextResponse.json({ preview: cd.empty ? null : cd.preview ?? null });
  } catch {
    // кэш недоступен — просто сходим за страницей напрямую
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MiligramLinkPreview/1.0)", Accept: "text/html" },
    }).finally(() => clearTimeout(timer));

    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("text/html")) {
      await ref.set({ at: Date.now(), empty: true }).catch(() => {});
      return NextResponse.json({ preview: null });
    }

    let html = "";
    const reader = res.body?.getReader();
    if (reader) {
      const dec = new TextDecoder();
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
        total += value.byteLength;
      }
      reader.cancel().catch(() => {});
    } else {
      html = await res.text();
    }

    const preview = extract(html, u.toString());
    const empty = !preview.title && !preview.description && !preview.image;
    await ref.set(empty ? { at: Date.now(), empty: true } : { at: Date.now(), preview }).catch(() => {});
    return NextResponse.json({ preview: empty ? null : preview });
  } catch {
    await ref.set({ at: Date.now(), empty: true }).catch(() => {});
    return NextResponse.json({ preview: null });
  }
}

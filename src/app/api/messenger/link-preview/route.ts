import { NextRequest, NextResponse } from "next/server";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

const MAX_BYTES = 400_000;
const cache = new Map<string, { at: number; data: Preview | null }>();
interface Preview { url: string; site: string; title: string; description: string; image: string }

/** Адрес не должен вести во внутреннюю сеть (защита от SSRF). */
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || (u.port && !["80", "443"].includes(u.port))) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  try {
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
    if (!ips.length || ips.some(isPrivateIp)) return null;
  } catch { return null; }
  return u;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

function meta(html: string, names: string[]): string {
  for (const n of names) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, "i");
    const m = re1.exec(html) ?? re2.exec(html);
    if (m?.[1]) return decode(m[1]);
  }
  return "";
}

/** GET ?url=https://… -> { preview: { url, site, title, description, image } | null } */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_lp_${me.uid}`, 60, 60_000))) return fail("Слишком часто", 429);

  const raw = (req.nextUrl.searchParams.get("url") ?? "").slice(0, 2000);
  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < 3_600_000) return NextResponse.json({ preview: hit.data }, { headers: { "Cache-Control": "private, max-age=3600" } });

  let preview: Preview | null = null;
  try {
    let u = await safeUrl(raw);
    let res: Response | null = null;
    for (let i = 0; u && i < 4; i++) {
      res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "User-Agent": "MiliGramBot/1.0 (link preview)", Accept: "text/html" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        u = await safeUrl(new URL(res.headers.get("location")!, u).toString());
        res = null;
        continue;
      }
      break;
    }
    if (u && res?.ok && /text\/html/i.test(res.headers.get("content-type") ?? "")) {
      const reader = res.body?.getReader();
      let html = "";
      let size = 0;
      const dec = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        size += value.length;
        html += dec.decode(value, { stream: true });
        if (size > MAX_BYTES || /<\/head>/i.test(html)) { reader.cancel().catch(() => {}); break; }
      }
      const title = meta(html, ["og:title", "twitter:title"]) || decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "");
      const description = meta(html, ["og:description", "twitter:description", "description"]).slice(0, 240);
      let image = meta(html, ["og:image", "twitter:image"]);
      if (image) { try { const iu = new URL(image, u); image = iu.protocol === "https:" ? iu.toString() : ""; } catch { image = ""; } }
      if (title) preview = { url: u.toString(), site: meta(html, ["og:site_name"]) || u.hostname.replace(/^www\./, ""), title: title.slice(0, 140), description, image };
    }
  } catch {}
  if (cache.size > 500) cache.clear();
  cache.set(raw, { at: Date.now(), data: preview });
  return NextResponse.json({ preview }, { headers: { "Cache-Control": "private, max-age=3600" } });
}

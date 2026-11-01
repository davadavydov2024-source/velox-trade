/**
 * Дополнительные каталоги свободной музыки: Openverse, ccMixter, Wikimedia Commons. Ключи не нужны.
 * Везде оставляем только лицензии CC BY / BY-SA / CC0 (без NC и ND). Идентификаторы: "ov:…", "cm:…", "wc:…".
 */
import { licenseLabel, type JamendoTrack } from "./jamendo";

const UA = { "User-Agent": "VeloxMessenger/1.0 (music import)" };
const OK_EXT = ["mp3", "ogg", "oga", "opus", "m4a"];
export const MIME: Record<string, string> = { mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4" };
const extOf = (s: string) => (/\.([a-z0-9]{2,4})(?:\?|$)/i.exec(s)?.[1] ?? "").toLowerCase();
const strip = (h: unknown) => String(h ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const j = async (url: string): Promise<any> => {
  const res = await fetch(url, { cache: "no-store", headers: UA });
  if (!res.ok) throw new Error(`src-${res.status}`);
  return res.json();
};

/* ───────────── Openverse ───────────── */
const ovTrack = (r: any): JamendoTrack | null => {
  const url = String(r.license_url || (r.license ? `https://creativecommons.org/licenses/${r.license}/${r.license_version ?? "4.0"}/` : ""));
  const license = r.license === "cc0" || r.license === "pdm" ? "CC0" : licenseLabel(url);
  const audio = String(r.url ?? "");
  const ext = extOf(audio) || String(r.filetype ?? "").toLowerCase();
  if (!license || !audio || !OK_EXT.includes(ext)) return null;
  return { id: `ov:${r.id}`, title: strip(r.title) || "Без названия", artist: strip(r.creator), duration: Math.round((Number(r.duration) || 0) / 1000), image: String(r.thumbnail ?? ""), audio, shareUrl: String(r.foreign_landing_url ?? ""), license, licenseUrl: url, score: 0, source: `Openverse${r.provider ? ` · ${r.provider}` : ""}`, ext };
};
async function openverse(q: string, ru: boolean, limit: number): Promise<JamendoTrack[]> {
  const qs = new URLSearchParams({ q: ru ? `${q} русский`.trim() : q, license_type: "commercial,modification", page_size: "20" });
  const d = await j(`https://api.openverse.org/v1/audio/?${qs}`);
  return (d.results ?? []).map(ovTrack).filter((t: JamendoTrack | null): t is JamendoTrack => !!t).slice(0, limit);
}
async function openverseById(id: string): Promise<JamendoTrack | null> {
  if (!/^[0-9a-f-]{20,40}$/i.test(id)) return null;
  return ovTrack(await j(`https://api.openverse.org/v1/audio/${id}/`));
}

/* ───────────── ccMixter ───────────── */
const cmTrack = (u: any): JamendoTrack | null => {
  const license = licenseLabel(String(u.license_url ?? ""));
  const f = (u.files ?? []).find((x: any) => OK_EXT.includes(extOf(String(x.download_url ?? ""))));
  if (!license || !f) return null;
  return { id: `cm:${u.upload_id}`, title: strip(u.upload_name) || "Без названия", artist: strip(u.user_real_name || u.user_name), duration: 0, image: "", audio: String(f.download_url), shareUrl: String(u.file_page_url ?? ""), license, licenseUrl: String(u.license_url), score: 0, source: "ccMixter", ext: extOf(String(f.download_url)) };
};
async function ccmixter(q: string, limit: number): Promise<JamendoTrack[]> {
  const qs = new URLSearchParams({ f: "json", limit: "20", sort: "rank", ...(q ? { search: q } : {}) });
  const d = await j(`https://ccmixter.org/api/query?${qs}`);
  return (Array.isArray(d) ? d : []).map(cmTrack).filter((t: JamendoTrack | null): t is JamendoTrack => !!t).slice(0, limit);
}
async function ccmixterById(id: string): Promise<JamendoTrack | null> {
  if (!/^\d{1,10}$/.test(id)) return null;
  const d = await j(`https://ccmixter.org/api/query?f=json&ids=${id}`);
  return Array.isArray(d) && d[0] ? cmTrack(d[0]) : null;
}

/* ───────────── Wikimedia Commons ───────────── */
const wcTrack = (p: any, maxBytes: number): JamendoTrack | null => {
  const ii = p?.imageinfo?.[0];
  if (!ii) return null;
  const x = ii.extmetadata ?? {};
  const short = strip(x.LicenseShortName?.value);
  const license = /^(cc0|public domain|pd)/i.test(short) ? "CC0" : licenseLabel(String(x.LicenseUrl?.value ?? ""));
  const ext = extOf(String(ii.url));
  if (!license || !OK_EXT.includes(ext) || (ii.size && ii.size > maxBytes)) return null;
  return { id: `wc:${p.pageid}`, title: strip(String(p.title ?? "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "")), artist: strip(x.Artist?.value), duration: 0, image: "", audio: String(ii.url), shareUrl: String(ii.descriptionurl ?? ""), license, licenseUrl: String(x.LicenseUrl?.value ?? ""), score: 0, source: "Wikimedia Commons", ext };
};
const WC = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|size|mime|extmetadata";
async function wikimedia(q: string, ru: boolean, limit: number, maxBytes: number): Promise<JamendoTrack[]> {
  if (!q.trim()) return [];
  const qs = new URLSearchParams({ generator: "search", gsrnamespace: "6", gsrlimit: "20", gsrsearch: `filetype:audio ${q}${ru ? " русский" : ""}` });
  const d = await j(`${WC}&${qs}`);
  return Object.values<any>(d?.query?.pages ?? {}).map((p) => wcTrack(p, maxBytes)).filter((t): t is JamendoTrack => !!t).slice(0, limit);
}
async function wikimediaById(id: string, maxBytes: number): Promise<JamendoTrack | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const d = await j(`${WC}&pageids=${id}`);
  return wcTrack(Object.values<any>(d?.query?.pages ?? {})[0], maxBytes);
}

/* ───────────── общий вход ───────────── */
export async function searchOpen(q: string, ru: boolean, maxBytes: number): Promise<JamendoTrack[]> {
  const r = await Promise.allSettled([openverse(q, ru, 5), ccmixter(q, 4), wikimedia(q, ru, 4, maxBytes)]);
  return r.flatMap((x) => (x.status === "fulfilled" ? x.value : []));
}
export async function openById(id: string, maxBytes: number): Promise<JamendoTrack | null> {
  if (id.startsWith("ov:")) return openverseById(id.slice(3));
  if (id.startsWith("cm:")) return ccmixterById(id.slice(3));
  if (id.startsWith("wc:")) return wikimediaById(id.slice(3), maxBytes);
  return null;
}

/**
 * Поиск музыки с открытыми лицензиями в каталоге Jamendo (https://developer.jamendo.com). Нужен бесплатный ключ: env JAMENDO_CLIENT_ID.
 * Берём только треки, которые можно свободно использовать: CC BY, CC BY-SA, CC0 (без NC «некоммерческое» и ND «без изменений»).
 * Требование лицензии CC BY — указывать автора и лицензию: они сохраняются в треке и показываются в каталоге «Музыка».
 */
export interface JamendoTrack {
  id: string; title: string; artist: string; duration: number; image: string; audio: string; shareUrl: string; license: string; licenseUrl: string; score: number; source?: string; ext?: string; lyrics?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[\[\](){}.,_\-–—!?"'«»]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length > 1);

/** «https://creativecommons.org/licenses/by-sa/3.0/» → «CC BY-SA 3.0»; null — лицензия нам не подходит. */
export function licenseLabel(url: string): string | null {
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z\-]+)\/?([\d.]*)/i.exec(url);
  if (!m) return null;
  const kind = m[2].toLowerCase();
  if (m[1] === "publicdomain" || kind === "zero" || kind === "mark") return "CC0";
  if (/(^|-)nc(-|$)/.test(kind) || /(^|-)nd(-|$)/.test(kind)) return null;
  return `CC ${kind.toUpperCase()}${m[3] ? ` ${m[3]}` : ""}`.trim();
}

export function hasKey(): boolean { return !!process.env.JAMENDO_CLIENT_ID; }

async function api(path: string, params: Record<string, string>): Promise<any[]> {
  const key = process.env.JAMENDO_CLIENT_ID;
  if (!key) throw new Error("no-key");
  const qs = new URLSearchParams({ client_id: key, format: "json", imagesize: "300", audioformat: "mp31", ...params });
  const res = await fetch(`https://api.jamendo.com/v3.0/${path}/?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`jamendo-${res.status}`);
  const d = await res.json();
  return Array.isArray(d.results) ? d.results : [];
}

const map = (r: any, q: string): JamendoTrack | null => {
  const license = licenseLabel(String(r.license_ccurl ?? ""));
  if (!license || !r.audio) return null;
  const want = new Set(tokens(q));
  const have = new Set([...tokens(String(r.name ?? "")), ...tokens(String(r.artist_name ?? ""))]);
  const hit = Array.from(want).filter((t) => have.has(t)).length;
  return { id: String(r.id), title: String(r.name ?? ""), artist: String(r.artist_name ?? ""), duration: Number(r.duration) || 0, image: String(r.image ?? ""), audio: String(r.audio), shareUrl: String(r.shareurl ?? ""), source: "Jamendo", lyrics: typeof r.lyrics === "string" ? r.lyrics.trim().slice(0, 8000) : undefined, license, licenseUrl: String(r.license_ccurl), score: want.size ? hit / want.size : 0 };
};

/** lang — язык текста песни (например "ru"); при пустом q возвращает популярное на этом языке. */
export async function searchJamendo(q: string, limit = 8, lang?: string): Promise<JamendoTrack[]> {
  const p: Record<string, string> = { limit: "40", include: "licenses+lyrics", order: q.trim() ? "relevance" : "popularity_month" };
  if (q.trim()) p.namesearch = norm(q);
  if (lang) p.lang = lang;
  const rows = await api("tracks", p);
  return rows.map((r) => map(r, q)).filter((t): t is JamendoTrack => !!t).sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function jamendoById(id: string): Promise<JamendoTrack | null> {
  const rows = await api("tracks", { id, include: "licenses+lyrics" });
  return rows[0] ? map(rows[0], "") : null;
}

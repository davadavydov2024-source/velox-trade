/** Поиск свободной музыки в Internet Archive (archive.org) — ключ не нужен. Берём только лицензии CC BY / BY-SA / CC0 (без NC и ND). */
import { licenseLabel, type JamendoTrack } from "./jamendo";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""));

export async function searchArchive(q: string, ru: boolean, limit = 6): Promise<JamendoTrack[]> {
  const text = norm(q);
  const parts = ["mediatype:audio", "licenseurl:[* TO *]"];
  if (text) parts.push(`(${text.split(" ").map((w) => `"${w}"`).join(" AND ")})`);
  if (ru) parts.push("language:(Russian OR rus OR ru)");
  const qs = new URLSearchParams({ q: parts.join(" AND "), rows: "30", output: "json", sort: "downloads desc" });
  for (const f of ["identifier", "title", "creator", "licenseurl"]) qs.append("fl[]", f);
  const res = await fetch(`https://archive.org/advancedsearch.php?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`archive-${res.status}`);
  const docs: any[] = (await res.json())?.response?.docs ?? [];
  const out: JamendoTrack[] = [];
  for (const d of docs) {
    const license = licenseLabel(one(d.licenseurl));
    if (!license || !d.identifier) continue;
    out.push({ id: `ia:${d.identifier}`, title: one(d.title), artist: one(d.creator), duration: 0, image: `https://archive.org/services/img/${d.identifier}`, audio: "", shareUrl: `https://archive.org/details/${d.identifier}`, license, licenseUrl: one(d.licenseurl), score: 0, source: "Internet Archive" });
    if (out.length >= limit) break;
  }
  return out;
}

/** Достаёт из элемента архива подходящий mp3 (не больше maxBytes) и возвращает трек с готовой ссылкой на файл. */
export async function archiveById(identifier: string, maxBytes: number): Promise<JamendoTrack | null> {
  if (!/^[A-Za-z0-9._\-]{1,200}$/.test(identifier)) return null;
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const m = await res.json();
  const license = licenseLabel(one(m?.metadata?.licenseurl));
  if (!license) return null;
  const files: any[] = (m.files ?? []).filter((f: any) => /\.mp3$/i.test(String(f.name)) && Number(f.size) > 100_000 && Number(f.size) <= maxBytes);
  if (!files.length) return null;
  const f = files.find((x) => /^(VBR )?MP3$/i.test(String(x.format))) ?? files[0];
  return {
    id: `ia:${identifier}`, title: one(f.title) || one(m.metadata?.title) || String(f.name), artist: one(f.creator) || one(m.metadata?.creator), duration: Math.round(Number(f.length) || 0),
    image: `https://archive.org/services/img/${identifier}`, audio: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(String(f.name))}`,
    shareUrl: `https://archive.org/details/${identifier}`, license, licenseUrl: one(m.metadata?.licenseurl), score: 0, source: "Internet Archive",
  };
}

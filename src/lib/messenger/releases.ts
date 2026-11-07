/** Репозиторий с релизами приложений (GitHub Releases). Можно переопределить переменной NEXT_PUBLIC_RELEASES_REPO в Vercel. */
export const RELEASES_REPO = process.env.NEXT_PUBLIC_RELEASES_REPO || "davadavydov2024-source/velox-trade";
/** Адрес самого мессенджера в браузере. */
export const APP_PATH = "/m";

export const WINDOWS_ASSET = "MiliGram-Setup.exe";
export const ANDROID_ASSET = "MiliGram.apk";

export interface ReleaseInfo {
  version: string;
  windows?: { url: string; sizeMb: number };
  android?: { url: string; sizeMb: number };
}

/** Последний релиз: версия и размеры файлов. Если репозиторий приватный или релизов ещё нет — null (на странице кнопки покажут «Скоро»). */
export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const r = (await res.json()) as { tag_name?: string; assets?: { name: string; size: number; browser_download_url: string }[] };
    const find = (name: string) => r.assets?.find((a) => a.name === name);
    const pick = (name: string) => {
      const a = find(name);
      return a ? { url: `https://github.com/${RELEASES_REPO}/releases/latest/download/${name}`, sizeMb: Math.round(a.size / 1048576) } : undefined;
    };
    const windows = pick(WINDOWS_ASSET);
    const android = pick(ANDROID_ASSET);
    if (!windows && !android) return null;
    return { version: (r.tag_name ?? "").replace(/^v/, ""), windows, android };
  } catch {
    return null;
  }
}

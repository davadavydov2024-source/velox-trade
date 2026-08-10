/**
 * next/image синхронно бросает исключение, если src не похож на абсолютный URL или путь,
 * начинающийся с "/". Если в Firestore случайно попало что-то вроде "а" или пустая строка,
 * это роняет всю страницу. Эта функция даёт безопасный src с запасным вариантом.
 */
export function safeImageSrc(src: string | null | undefined, fallback = "/placeholder.svg"): string {
  if (!src) return fallback;
  const trimmed = src.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return trimmed;
  }
  return fallback;
}

export function isValidImageSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  const trimmed = src.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/");
}

/** Человекочитаемое "был(а) в сети N назад" — используется рядом с зелёной точкой isOnline
 * у продавца, когда он офлайн (lastActiveAt приходит из /api/public-profile). */
export function formatLastSeen(lastActiveAt: number | null): string {
  if (!lastActiveAt) return "давно не заходил(а)";
  const diffMs = Date.now() - lastActiveAt;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `был(а) в сети ${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `был(а) в сети ${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `был(а) в сети ${days} дн назад`;
  return "давно не заходил(а)";
}

/**
 * Админ может ввести ссылку в поле "Ссылка кнопки" без "https://" (например "t.me/bot" вместо
 * "https://t.me/bot"). Без протокола браузер трактует такую ссылку как ОТНОСИТЕЛЬНЫЙ путь на
 * этом же сайте и приклеивает её к текущему адресу — получается 404 на несуществующей странице
 * вида "velox-trade.vercel.app/t.me/bot". Эта функция чинит такие ссылки на лету при показе,
 * не трогая то, что реально должно остаться относительным (например "/catalog").
 */
export function normalizeExternalUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

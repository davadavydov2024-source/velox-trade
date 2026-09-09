/** "FrostDragon" -> "Fr***gon". Используется в публичной ленте покупок — показываем, что сайт живой,
 * не раскрывая полный ник покупателя посторонним. Чистая функция, безопасна и для клиента, и для сервера. */
export function maskNickname(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 4) return `${trimmed.slice(0, 1)}***`;
  const visibleStart = 2;
  const visibleEnd = trimmed.length > 8 ? 3 : 1;
  return `${trimmed.slice(0, visibleStart)}***${trimmed.slice(trimmed.length - visibleEnd)}`;
}

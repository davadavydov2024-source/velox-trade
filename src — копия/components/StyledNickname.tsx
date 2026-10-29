import { getNicknameColorPreset, getNicknameFontPreset } from "@/lib/nicknameStyles";

/**
 * Рендерит ник с оформлением, заданным администратором (nameColor/nameFont на профиле — см.
 * types/index.ts). Если оформление не задано, рендерится как обычный текст — оборачивать в этот
 * компонент везде, где раньше был просто {profile.displayName}, безопасно и без визуальной разницы
 * для тех, кому админ ничего не назначал.
 */
export function StyledNickname({
  name,
  nameColor,
  nameFont,
  className,
}: {
  name: string;
  nameColor?: string;
  nameFont?: string;
  className?: string;
}) {
  const color = getNicknameColorPreset(nameColor);
  const font = getNicknameFontPreset(nameFont);

  const style: React.CSSProperties = {};
  if (color.color) {
    style.color = color.color;
    if (color.neon) {
      // Многослойный text-shadow тем же цветом — простой и дешёвый способ имитировать неоновое
      // свечение без CSS-фильтров (которые дорого пересчитываются в длинных списках ников).
      style.textShadow = `0 0 4px ${color.color}, 0 0 11px ${color.color}, 0 0 19px ${color.color}66`;
    }
  }
  if (font.fontFamily) style.fontFamily = font.fontFamily;

  return (
    <span className={`${font.className ?? ""} ${className ?? ""}`} style={style}>
      {name}
    </span>
  );
}

import { adminDb } from "@/lib/firebaseAdmin";

/** Стили иконки MiliGram. Картинки лежат в public/miligram/styles/<id>-{180,192,512,maskable-512}.png. Выбирает админ. */
export const APP_ICON_STYLES = [
  { id: "classic", label: "Классика" },
  { id: "ocean", label: "Океан" },
  { id: "dark", label: "Тёмная" },
  { id: "mint", label: "Мята" },
  { id: "violet", label: "Фиолет" },
  { id: "sunset", label: "Закат" },
  { id: "night", label: "Ночь" },
  { id: "sakura", label: "Сакура" },
  { id: "gold", label: "Золото" },
  { id: "minimal", label: "Минимал" },
  { id: "telegram", label: "Лазурь" },
  { id: "neon", label: "Неон" },
  { id: "crimson", label: "Рубин" },
  { id: "forest", label: "Лес" },
] as const;

export type AppIconId = (typeof APP_ICON_STYLES)[number]["id"];
export const DEFAULT_APP_ICON: AppIconId = "classic";
export const isAppIcon = (v: unknown): v is AppIconId => APP_ICON_STYLES.some((s) => s.id === v);

/** Текущий стиль иконки (выбор админа); при любой ошибке — стандартный. */
export async function getAppIconStyle(): Promise<AppIconId> {
  try {
    const d = (await adminDb().collection("messengerConfig").doc("appIcon").get()).data();
    return isAppIcon(d?.style) ? d!.style : DEFAULT_APP_ICON;
  } catch {
    return DEFAULT_APP_ICON;
  }
}

export const iconPaths = (id: AppIconId) => ({
  i180: `/miligram/styles/${id}-180.png`,
  i192: `/miligram/styles/${id}-192.png`,
  i512: `/miligram/styles/${id}-512.png`,
  maskable: `/miligram/styles/${id}-maskable-512.png`,
});

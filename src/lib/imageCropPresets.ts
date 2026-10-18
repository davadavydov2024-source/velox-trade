/**
 * Обрезка фото под назначение. Каждое назначение задаёт соотношение сторон по умолчанию, форму
 * (круг/прямоугольник), набор вариантов, между которыми можно переключиться в окне обрезки,
 * и максимальную ширину результата (фото уменьшается — быстрее грузится и не упирается в лимит 4 МБ).
 */
export type CropPurpose = "avatar" | "product" | "game" | "ad" | "banner" | "wide" | "square";

export interface AspectOption {
  label: string;
  value: number;
}

export interface CropPreset {
  label: string;
  aspect: number;
  round?: boolean;
  options?: AspectOption[]; // если задано — в окне обрезки появятся кнопки выбора пропорций
  maxWidth: number;
}

const SQUARE: AspectOption = { label: "1:1", value: 1 };
const FOUR_THREE: AspectOption = { label: "4:3", value: 4 / 3 };
const THREE_FOUR: AspectOption = { label: "3:4", value: 3 / 4 };
const WIDE: AspectOption = { label: "16:9", value: 16 / 9 };

export const CROP_PRESETS: Record<CropPurpose, CropPreset> = {
  avatar: { label: "Аватар", aspect: 1, round: true, maxWidth: 512 },
  product: { label: "Товар", aspect: 1, options: [SQUARE, FOUR_THREE, THREE_FOUR], maxWidth: 1024 },
  game: { label: "Игра", aspect: 1, maxWidth: 512 },
  ad: { label: "Реклама", aspect: 16 / 9, options: [WIDE, SQUARE], maxWidth: 1280 },
  banner: { label: "Баннер", aspect: 2, options: [{ label: "2:1", value: 2 }, { label: "3:1", value: 3 }, WIDE], maxWidth: 1600 },
  wide: { label: "Фото", aspect: 16 / 9, options: [WIDE, FOUR_THREE, SQUARE], maxWidth: 1280 },
  square: { label: "Картинка", aspect: 1, options: [SQUARE, FOUR_THREE, WIDE], maxWidth: 1024 },
};

/** Назначение по умолчанию для папки загрузки (если purpose не указан явно). */
export const DEFAULT_PURPOSE_BY_FOLDER: Record<string, CropPurpose> = {
  avatars: "avatar",
  products: "product",
  "sell-requests": "product",
  games: "game",
  ads: "ad",
  broadcasts: "banner",
  news: "wide",
  contests: "wide",
  "site-screens": "square",
};

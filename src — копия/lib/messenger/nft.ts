/**
 * NFT-подарки MiliGram: каждый экземпляр уникален — номер из тиража + случайные модель, фон и узор (как в Telegram).
 * Картинка не хранится: её рисует компонент NftArt по этим признакам, так что генерация бесплатная и мгновенная.
 * Редкость (rarity) — вес выпадения: чем меньше, тем реже. Из трёх признаков считается общий уровень экземпляра
 * (Обычный → Мифический), а особые номера (#1…#10, последний, 77, 100, 777…) отмечаются отдельно.
 * Новые признаки только ДОБАВЛЯЮТСЯ в конец списков — уже выданные NFT ссылаются на признаки по названию.
 */
import type { GiftNft } from "./gifts";

export interface NftTrait { name: string; rarity: number }
export interface NftBackdrop extends NftTrait { colors: [string, string] }
export interface NftModel extends NftTrait { hue: number; sat: number; flip?: boolean; bright?: number; anim?: "rainbow" | "holo" | "pulse" | "shimmer" | "flame" | "aurora" | "glitch" | "spin" }

export const NFT_BACKDROPS: NftBackdrop[] = [
  { name: "Полночь", colors: ["#2a3f8f", "#070a1f"], rarity: 140 },
  { name: "Изумруд", colors: ["#1d8a5f", "#04170f"], rarity: 140 },
  { name: "Рассвет", colors: ["#e0663a", "#2a0e12"], rarity: 120 },
  { name: "Сакура", colors: ["#d9669f", "#27101d"], rarity: 120 },
  { name: "Лайм Velox", colors: ["#b6e33a", "#13190a"], rarity: 100 },
  { name: "Океан", colors: ["#1fa3c9", "#06151c"], rarity: 100 },
  { name: "Аметист", colors: ["#8a4fd6", "#140a24"], rarity: 90 },
  { name: "Янтарь", colors: ["#e0a21f", "#201404"], rarity: 80 },
  { name: "Графит", colors: ["#5a5f6b", "#0b0c0f"], rarity: 60 },
  { name: "Космос", colors: ["#5b2bd1", "#02010a"], rarity: 30 },
  { name: "Золотой час", colors: ["#ffd56a", "#3a2204"], rarity: 20 },
  // — новые
  { name: "Рубин", colors: ["#d11f3f", "#1f040b"], rarity: 90 },
  { name: "Бирюза", colors: ["#2fd1b3", "#052019"], rarity: 90 },
  { name: "Лаванда", colors: ["#a99bf0", "#1a1530"], rarity: 80 },
  { name: "Мандарин", colors: ["#ff8a1f", "#2a1204"], rarity: 80 },
  { name: "Бархат", colors: ["#7a1f4d", "#14060d"], rarity: 70 },
  { name: "Мрамор", colors: ["#b9bec9", "#1a1c22"], rarity: 50 },
  { name: "Северное сияние", colors: ["#3ee6a8", "#0b1d4a"], rarity: 25 },
  { name: "Лава", colors: ["#ff4b1f", "#240606"], rarity: 25 },
  { name: "Бездна", colors: ["#1c1f5c", "#000000"], rarity: 15 },
  { name: "Закат Velox", colors: ["#ff9800", "#3a0d45"], rarity: 12 },
  { name: "Радужная дымка", colors: ["#ff6ec7", "#3a1c9e"], rarity: 8 },
  // — ещё новые
  { name: "Мята", colors: ["#7df2c8", "#06231b"], rarity: 90 },
  { name: "Персик", colors: ["#ffb199", "#2e1410"], rarity: 85 },
  { name: "Индиго", colors: ["#4b3fd1", "#0a0720"], rarity: 80 },
  { name: "Болото", colors: ["#6b8f2a", "#0f1705"], rarity: 70 },
  { name: "Неоновый город", colors: ["#ff2fd1", "#071a3a"], rarity: 22 },
  { name: "Туманность", colors: ["#9b5cff", "#0a2a5c"], rarity: 14 },
  { name: "Чёрное золото", colors: ["#f0c040", "#000000"], rarity: 6 },
  // — коллекция «Анимации»
  { name: "Сумерки", colors: ["#6a4cff", "#0b0620"], rarity: 80 },
  { name: "Карамель", colors: ["#ff7ab8", "#3a1030"], rarity: 85 },
  { name: "Глубокий лес", colors: ["#2f8f4e", "#04140a"], rarity: 80 },
  { name: "Медь", colors: ["#d98a4a", "#1f0f06"], rarity: 70 },
  { name: "Ледник", colors: ["#9be7ff", "#0a2233"], rarity: 60 },
  { name: "Электрик", colors: ["#2f6bff", "#00071f"], rarity: 28 },
  { name: "Хамелеон", colors: ["#00e0b0", "#5a1fd1"], rarity: 16 },
  { name: "Звёздная пыль", colors: ["#c9b6ff", "#0b0820"], rarity: 10 },
  { name: "Солнечное затмение", colors: ["#ffb347", "#000000"], rarity: 5 },
];

export const NFT_MODELS: NftModel[] = [
  { name: "Классика", hue: 0, sat: 1, rarity: 300 },
  { name: "Лёд", hue: 150, sat: 0.9, rarity: 200 },
  { name: "Неон", hue: 280, sat: 1.4, rarity: 180 },
  { name: "Закат", hue: 330, sat: 1.2, rarity: 150 },
  { name: "Мята", hue: 80, sat: 1.1, rarity: 100 },
  { name: "Призрак", hue: 0, sat: 0.15, rarity: 50 },
  { name: "Зеркальный", hue: 200, sat: 1.6, flip: true, rarity: 20 },
  // — новые
  { name: "Золото", hue: 40, sat: 1.9, rarity: 40 },
  { name: "Рубиновый", hue: 340, sat: 1.9, rarity: 35 },
  { name: "Изумрудный", hue: 120, sat: 1.7, rarity: 35 },
  { name: "Электро", hue: 190, sat: 2.2, rarity: 30 },
  { name: "Обсидиан", hue: 260, sat: 0.6, bright: 0.55, rarity: 25 },
  { name: "Радужный", hue: 0, sat: 1.5, anim: "rainbow", rarity: 12 },
  { name: "Голограмма", hue: 200, sat: 1.3, anim: "holo", rarity: 8 },
  // — ещё новые
  { name: "Закатный", hue: 20, sat: 1.5, rarity: 60 },
  { name: "Хром", hue: 210, sat: 0.35, bright: 1.25, rarity: 28 },
  { name: "Пульсар", hue: 300, sat: 2.0, anim: "pulse", rarity: 14 },
  { name: "Призма", hue: 0, sat: 1.8, anim: "rainbow", rarity: 6 },
  // — коллекция «Анимации»
  { name: "Янтарный", hue: 30, sat: 1.6, rarity: 55 },
  { name: "Сапфир", hue: 215, sat: 1.9, rarity: 32 },
  { name: "Аметистовый", hue: 270, sat: 1.8, rarity: 30 },
  { name: "Мираж", hue: 160, sat: 1.4, anim: "shimmer", rarity: 16 },
  { name: "Магма", hue: 10, sat: 2.2, anim: "flame", rarity: 12 },
  { name: "Аврора", hue: 140, sat: 1.8, anim: "aurora", rarity: 9 },
  { name: "Глитч", hue: 320, sat: 2.0, anim: "glitch", rarity: 7 },
  { name: "Квазар", hue: 220, sat: 2.4, anim: "spin", rarity: 4 },
];

export const NFT_SYMBOLS: NftTrait[] = [
  { name: "Звёзды", rarity: 260 }, { name: "Сердца", rarity: 200 }, { name: "Молнии", rarity: 170 },
  { name: "Луны", rarity: 140 }, { name: "Искры", rarity: 120 }, { name: "Кристаллы", rarity: 80 }, { name: "Короны", rarity: 30 },
  // — новые
  { name: "Снежинки", rarity: 150 }, { name: "Цветы", rarity: 130 }, { name: "Лучи", rarity: 110 }, { name: "Ноты", rarity: 100 },
  { name: "Клеверы", rarity: 90 }, { name: "Пики", rarity: 60 }, { name: "Инь-ян", rarity: 40 },
  // — ещё новые
  { name: "Пламя", rarity: 70 }, { name: "Капли", rarity: 120 }, { name: "Планеты", rarity: 35 },
  // — коллекция «Анимации»
  { name: "Бабочки", rarity: 90 }, { name: "Кометы", rarity: 55 }, { name: "Ключи", rarity: 50 }, { name: "Глаза", rarity: 45 },
];
export const NFT_SYMBOL_CHARS: Record<string, string> = {
  "Звёзды": "★", "Сердца": "♥", "Молнии": "ϟ", "Луны": "☾", "Искры": "✦", "Кристаллы": "◆", "Короны": "♛",
  "Снежинки": "❄", "Цветы": "✿", "Лучи": "☀", "Ноты": "♪", "Клеверы": "♣", "Пики": "♠", "Инь-ян": "☯",
  "Пламя": "🔥", "Капли": "💧", "Планеты": "🪐",
  "Бабочки": "🦋", "Кометы": "☄", "Ключи": "🗝", "Глаза": "👁",
};

function pick<T extends NftTrait>(list: T[], rnd: number): T {
  const total = list.reduce((n, t) => n + t.rarity, 0);
  let x = rnd * total;
  for (const t of list) { x -= t.rarity; if (x < 0) return t; }
  return list[list.length - 1];
}

/** Случайные признаки нового экземпляра. rnd — функция [0,1) (на сервере передаём crypto). */
export function rollNft(number: number, supply: number, rnd: () => number = Math.random): GiftNft {
  return { number, supply, model: pick(NFT_MODELS, rnd()).name, backdrop: pick(NFT_BACKDROPS, rnd()).name, symbol: pick(NFT_SYMBOLS, rnd()).name };
}

export const backdropOf = (name: string) => NFT_BACKDROPS.find((b) => b.name === name) ?? NFT_BACKDROPS[0];
export const modelOf = (name: string) => NFT_MODELS.find((m) => m.name === name) ?? NFT_MODELS[0];
export const symbolOf = (name: string) => NFT_SYMBOLS.find((s) => s.name === name) ?? NFT_SYMBOLS[0];
/** «1.4%» из промилле */
export const rarityPct = (r: number) => `${(r / 10).toFixed(r % 10 === 0 ? 0 : 1)}%`;

/* ───────── Уровень редкости экземпляра и особые номера ───────── */

export type NftTierId = "common" | "rare" | "epic" | "legendary" | "mythic";
export const NFT_TIERS: Record<NftTierId, { label: string; color: string; sparkles: number }> = {
  common: { label: "Обычный", color: "#9aa3b2", sparkles: 0 },
  rare: { label: "Редкий", color: "#4da3ff", sparkles: 3 },
  epic: { label: "Эпический", color: "#b36bff", sparkles: 5 },
  legendary: { label: "Легендарный", color: "#ffb400", sparkles: 7 },
  mythic: { label: "Мифический", color: "#ff5ca8", sparkles: 9 },
};

function prob<T extends NftTrait>(list: T[], name: string): number {
  const total = list.reduce((n, t) => n + t.rarity, 0);
  return (list.find((t) => t.name === name) ?? list[0]).rarity / total;
}

/** Шанс именно такого сочетания признаков (0…1). */
export function nftComboChance(nft: Pick<GiftNft, "model" | "backdrop" | "symbol">): number {
  return prob(NFT_MODELS, nft.model) * prob(NFT_BACKDROPS, nft.backdrop) * prob(NFT_SYMBOLS, nft.symbol);
}

export function nftTier(nft: Pick<GiftNft, "model" | "backdrop" | "symbol">): NftTierId {
  const p = nftComboChance(nft);
  if (p < 2e-6) return "mythic";
  if (p < 3e-5) return "legendary";
  if (p < 3e-4) return "epic";
  if (p < 2e-3) return "rare";
  return "common";
}

/** Особый номер: #1–#10, последний в тираже, круглые сотни, повторяющиеся цифры (77, 111, 777…). */
export function isSpecialNumber(n: number, supply: number): boolean {
  return n <= 10 || n === supply || (n >= 100 && n % 100 === 0) || (n >= 11 && /^(\d)\1+$/.test(String(n)));
}

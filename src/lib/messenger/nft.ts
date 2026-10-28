/**
 * NFT-подарки MiliGram: каждый экземпляр уникален — номер из тиража + случайные модель, фон и узор (как в Telegram).
 * Картинка не хранится: её рисует компонент NftArt по этим признакам, так что генерация бесплатная и мгновенная.
 * Редкость (rarity) — шанс выпадения в промилле: чем меньше, тем реже.
 */
import type { GiftNft } from "./gifts";

export interface NftTrait { name: string; rarity: number }
export interface NftBackdrop extends NftTrait { colors: [string, string] }
export interface NftModel extends NftTrait { hue: number; sat: number; flip?: boolean; anim?: "holo" | "rainbow"; bright?: number }

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
];

export const NFT_MODELS: NftModel[] = [
  { name: "Классика", hue: 0, sat: 1, rarity: 300 },
  { name: "Лёд", hue: 150, sat: 0.9, rarity: 200 },
  { name: "Неон", hue: 280, sat: 1.4, rarity: 180 },
  { name: "Закат", hue: 330, sat: 1.2, rarity: 150 },
  { name: "Мята", hue: 80, sat: 1.1, rarity: 100 },
  { name: "Призрак", hue: 0, sat: 0.15, rarity: 50 },
  { name: "Зеркальный", hue: 200, sat: 1.6, flip: true, rarity: 20 },
];

export const NFT_SYMBOLS: NftTrait[] = [
  { name: "Звёзды", rarity: 260 }, { name: "Сердца", rarity: 200 }, { name: "Молнии", rarity: 170 },
  { name: "Луны", rarity: 140 }, { name: "Искры", rarity: 120 }, { name: "Кристаллы", rarity: 80 }, { name: "Короны", rarity: 30 },
];
export const NFT_SYMBOL_CHARS: Record<string, string> = { "Звёзды": "★", "Сердца": "♥", "Молнии": "ϟ", "Луны": "☾", "Искры": "✦", "Кристаллы": "◆", "Короны": "♛" };

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

/** Шанс именно такой комбинации признаков (0..1). */
export const nftComboChance = (nft: Pick<GiftNft, "model" | "backdrop" | "symbol">): number =>
  (modelOf(nft.model).rarity / 1000) * (backdropOf(nft.backdrop).rarity / 1000) * (symbolOf(nft.symbol).rarity / 1000);

export type NftTier = "mythic" | "legendary" | "epic" | "common";

export const NFT_TIERS: Record<NftTier, { label: string; color: string; sparkles: number }> = {
  mythic: { label: "Мифический", color: "#ff5fd2", sparkles: 9 },
  legendary: { label: "Легендарный", color: "#ffd56a", sparkles: 7 },
  epic: { label: "Эпический", color: "#b58cff", sparkles: 4 },
  common: { label: "Обычный", color: "#9aa4b2", sparkles: 0 },
};

export function nftTier(nft: Pick<GiftNft, "model" | "backdrop" | "symbol">): NftTier {
  const c = nftComboChance(nft);
  return c < 0.0001 ? "mythic" : c < 0.0008 ? "legendary" : c < 0.004 ? "epic" : "common";
}

export function isSpecialNumber(n: number, supply: number): boolean {
  if (n === 1 || n === supply) return true;
  const s = String(n);
  if (s.length < 3) return false;
  if (/^(\d)\1+$/.test(s)) return true;
  if (/^10+$/.test(s)) return true;
  if (s === [...s].reverse().join("")) return true;
  return n === 1337 || n === 1234;
}
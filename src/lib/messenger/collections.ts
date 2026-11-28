/**
 * Коллекции NFT: «Кнопка», «Персонаж», «Факел» (Chill Flame) и «Сигара». У каждой коллекции — свои модели, и каждая модель — отдельная картинка.
 * При покупке подарка выпадает случайная модель коллекции (по весу в промилле, сумма по коллекции ровно 1000‰), как в Telegram.
 * Картинки лежат слоями в public/nft/<папка модели>/*.webp, анимация — CSS-классами mx-nf-* из messenger.css.
 *
 * Как добавить модель: положить слои в public/nft/<папка>/ (base.webp + при желании отдельные части), добавить строку в нужный список
 * ниже и поправить веса так, чтобы сумма осталась 1000. Рисунок — строка SVG в квадрате 100×100, статичный, из нашего кода (без пользовательского ввода).
 */

export interface CollectionModel { name: string; rarity: number }
export interface Collection { id: string; title: string; models: CollectionModel[]; render: (modelName: string) => string }

type Item = { name: string; rarity: number; svg: string };

function make(id: string, title: string, list: Item[]): Collection {
  const byName = new Map(list.map((m) => [m.name, m.svg]));
  return {
    id, title,
    models: list.map(({ name, rarity }) => ({ name, rarity })),
    render: (name) => byName.get(name) ?? list[0].svg,
  };
}

const BUTTON_ITEMS: Item[] = [
  { name: "Сердце", rarity: 300, svg: "<g class=\"mx-nf mx-nf-bob\" style=\"transform-origin:50% 80%;animation-delay:0s\"><image href=\"/nft/nft-btn-heart/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><g class=\"mx-nf mx-nf-heart\" style=\"transform-origin:49.9% 48.7%\"><image href=\"/nft/nft-btn-heart/heart.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/></g><g transform=\"translate(81.0 19.7) scale(1.5)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0s\"/></g><g transform=\"translate(16.9 67.3) scale(1.0)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0.8s\"/></g><g transform=\"translate(60.8 84.9) scale(0.8)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:1.5s\"/></g></g>" },
  { name: "Галочка", rarity: 250, svg: "<g class=\"mx-nf mx-nf-pop\" style=\"transform-origin:50% 70%;animation-delay:0s\"><image href=\"/nft/nft-btn-check/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><g transform=\"translate(81.0 19.3) scale(1.5)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0s\"/></g><g transform=\"translate(16.9 67.6) scale(1.0)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0.8s\"/></g><g transform=\"translate(60.8 85.4) scale(0.8)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:1.5s\"/></g></g>" },
  { name: "Крипер", rarity: 200, svg: "<g class=\"mx-nf mx-nf-hiss\" style=\"transform-origin:50% 78%;animation-delay:0s\"><image href=\"/nft/nft-btn-creeper/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><g transform=\"translate(81.0 18.7) scale(1.5)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0.4s\"/></g><g transform=\"translate(16.9 68.2) scale(1.0)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:1.2s\"/></g><g transform=\"translate(60.8 86.5) scale(0.8)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:2s\"/></g></g>" },
  { name: "Поцелуй", rarity: 150, svg: "<g class=\"mx-nf mx-nf-bob\" style=\"transform-origin:50% 80%;animation-delay:0s\"><image href=\"/nft/nft-btn-lips/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><g class=\"mx-nf mx-nf-kiss\" style=\"transform-origin:47.1% 30.3%\"><image href=\"/nft/nft-btn-lips/lips.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/></g><g transform=\"translate(81.0 20.2) scale(1.5)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0s\"/></g><g transform=\"translate(16.9 67.1) scale(1.0)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0.8s\"/></g><g transform=\"translate(60.8 84.4) scale(0.8)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:1.5s\"/></g></g>" },
  { name: "BAN", rarity: 100, svg: "<g class=\"mx-nf mx-nf-press\" style=\"transform-origin:50% 85%;animation-delay:0s\"><image href=\"/nft/nft-btn-ban/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><g transform=\"translate(81.0 21.4) scale(1.5)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0s\"/></g><g transform=\"translate(16.9 66.3) scale(1.0)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0.8s\"/></g><g transform=\"translate(60.8 82.9) scale(0.8)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:1.5s\"/></g></g>" },
];

const HERO_ITEMS: Item[] = [
  { name: "Парень с топором", rarity: 250, svg: "<g class=\"mx-nf mx-nf-bounce\" style=\"transform-origin:50% 94%;animation-delay:0.7s\"><image href=\"/nft/nft-chr-axe/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"64.3\" cy=\"36.6\" rx=\"6.4\" ry=\"6.4\" fill=\"#f0c5a1\" style=\"animation-delay:0.62s\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"43.5\" cy=\"36.9\" rx=\"5.6\" ry=\"6.1\" fill=\"#e4c6aa\" style=\"animation-delay:0.65s\"/></g>" },
  { name: "Блондинка в белом", rarity: 230, svg: "<g class=\"mx-nf mx-nf-bounce\" style=\"transform-origin:50% 94%;animation-delay:1.05s\"><image href=\"/nft/nft-chr-blonde/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"57.1\" cy=\"44.0\" rx=\"7.8\" ry=\"7.0\" fill=\"#fccaab\" style=\"animation-delay:0.8300000000000001s\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"33.1\" cy=\"49.8\" rx=\"7.0\" ry=\"6.1\" fill=\"#fbc7a9\" style=\"animation-delay:0.8600000000000001s\"/></g>" },
  { name: "Артист в шляпе", rarity: 220, svg: "<g class=\"mx-nf mx-nf-bounce\" style=\"transform-origin:50% 94%;animation-delay:1.4s\"><image href=\"/nft/nft-chr-hat/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/></g>" },
  { name: "Боксёр", rarity: 200, svg: "<g class=\"mx-nf mx-nf-bounce\" style=\"transform-origin:50% 94%;animation-delay:0.35s\"><image href=\"/nft/nft-chr-boxer/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"64.6\" cy=\"39.8\" rx=\"6.6\" ry=\"6.7\" fill=\"#df7b3e\" style=\"animation-delay:0.41000000000000003s\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"42.1\" cy=\"38.7\" rx=\"5.9\" ry=\"6.4\" fill=\"#e88745\" style=\"animation-delay:0.44000000000000006s\"/></g>" },
  { name: "Супергерой с молоком", rarity: 100, svg: "<g class=\"mx-nf mx-nf-bounce\" style=\"transform-origin:50% 94%;animation-delay:0s\"><image href=\"/nft/nft-chr-hero/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"63.4\" cy=\"36.2\" rx=\"6.2\" ry=\"6.6\" fill=\"#f5ab73\" style=\"animation-delay:0.2s\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"42.7\" cy=\"35.2\" rx=\"5.8\" ry=\"6.4\" fill=\"#f6b480\" style=\"animation-delay:0.23s\"/></g>" },
];

const TORCH_ITEMS: Item[] = [
  { name: "Chill Flame", rarity: 1000, svg: "<g class=\"mx-nf mx-nf-sway\" style=\"transform-origin:50% 96%;animation-delay:0s\"><ellipse class=\"mx-nf mx-nf-glow\" cx=\"40.8\" cy=\"20.5\" rx=\"13\" ry=\"15\" fill=\"#3dff6a\"/><image href=\"/nft/nft-chill-flame/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><g class=\"mx-nf mx-nf-flap\" style=\"transform-origin:54.5% 41.0%\"><image href=\"/nft/nft-chill-flame/butterfly.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/></g><g transform=\"translate(66.5 18.1) scale(1.5)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0s\"/></g><g transform=\"translate(32.2 68.5) scale(1.0)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0.8s\"/></g><g transform=\"translate(55.7 87.2) scale(0.8)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:1.5s\"/></g></g>" },
];

const CIGAR_ITEMS: Item[] = [
  { name: "Дымная сигара", rarity: 1000, svg: "<g class=\"mx-nf mx-nf-drift\" style=\"transform-origin:50% 60%;animation-delay:0s\"><image href=\"/nft/nft-cigar/base.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/><ellipse class=\"mx-nf mx-nf-ember\" cx=\"32.1\" cy=\"67.4\" rx=\"11\" ry=\"9\" fill=\"#ff6a1a\"/><g class=\"mx-nf mx-nf-smoke\" style=\"transform-origin:62% 60%\"><image href=\"/nft/nft-cigar/smoke.webp\" x=\"0\" y=\"0\" width=\"100\" height=\"100\"/></g><ellipse class=\"mx-nf mx-nf-blink\" cx=\"59.0\" cy=\"51.9\" rx=\"5.2\" ry=\"3.4\" fill=\"#ad5831\" style=\"animation-delay:0.2s\"/><ellipse class=\"mx-nf mx-nf-blink\" cx=\"78.1\" cy=\"44.0\" rx=\"5.2\" ry=\"3.4\" fill=\"#a55d3d\" style=\"animation-delay:0.24s\"/><g transform=\"translate(82.4 33.8) scale(1.5)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:0.2s\"/></g><g transform=\"translate(16.3 67.7) scale(1.0)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:1.1s\"/></g><g transform=\"translate(61.6 80.3) scale(0.8)\"><path class=\"mx-nf mx-nf-twinkle\" d=\"M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z\" fill=\"#fff\" style=\"animation-delay:1.9s\"/></g></g>" },
];

export const BUTTON = make("nft-button", "Кнопка", BUTTON_ITEMS);
export const HEROES = make("nft-hero", "Персонаж", HERO_ITEMS);
export const TORCHES = make("nft-torch", "Факел", TORCH_ITEMS);
export const CIGARS = make("nft-cigar", "Сигара", CIGAR_ITEMS);

/** Все коллекции по id подарка. */
export const COLLECTIONS: Record<string, Collection> = {
  [BUTTON.id]: BUTTON, [HEROES.id]: HEROES, [TORCHES.id]: TORCHES, [CIGARS.id]: CIGARS,
};

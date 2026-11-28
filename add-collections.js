// Добавляет коллекции «Какашка», «Для девушки» и «Колобок» в новую систему коллекций (collections.ts + gifts.ts).
// Картинки уже лежат в public/nft/poop, public/nft/girl, public/nft/kolobok.
// Запуск из корня репозитория: node add-collections.js   (можно запускать повторно)
const fs = require("fs");

function patch(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("без изменений:", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  console.log("обновлён:", file);
}
function must(cond, msg) { if (!cond) { console.error("ОШИБКА:", msg); process.exit(1); } }

const STAR_D = "M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z";
const star = (x, y, s, d) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="mx-nf mx-nf-twinkle" d="${STAR_D}" fill="#fff" style="animation-delay:${d}s"/></g>`;
const img = (dir, part) => `<image href="/nft/${dir}/${part}.webp" x="0" y="0" width="100" height="100"/>`;
const body = (anim, origin, inner) => `<g class="mx-nf ${anim}" style="transform-origin:${origin};animation-delay:0s">${inner}</g>`;

const POOP = [
  ["Принцесса", 300, body("mx-nf-jelly", "50% 98%", img("poop", "pink") + star(24, 40, 1.4, 0.2) + star(78, 30, 1.1, 1.1) + star(70, 62, 0.9, 1.8))],
  ["Кошка", 280, body("mx-nf-breathe", "50% 98%", img("poop", "cat"))],
  ["Байкер", 220, body("mx-nf-wobble", "50% 98%", img("poop", "black"))],
  ["Золотая", 150, body("mx-nf-jelly", "50% 98%", img("poop", "gold") + star(34, 40, 1.6, 0) + star(62, 48, 1.3, 0.7) + star(48, 22, 1.1, 1.4) + star(72, 66, 1.0, 2.0))],
  ["Ангел", 50, body("mx-nf-bob", "50% 80%", img("poop", "angel") + star(22, 28, 1.3, 0.3) + star(80, 24, 1.2, 1.2) + star(50, 8, 1.0, 1.9))],
];
const GIRL = [
  ["Клубника в шоколаде", 280, body("mx-nf-jelly", "50% 98%", img("girl", "berries"))],
  ["Сердце в паутинке", 250, body("mx-nf-wobble", "50% 98%", img("girl", "web") + star(30, 34, 1.2, 0.4) + star(70, 40, 1.4, 1.3) + star(52, 70, 1.0, 2.0))],
  ["Сердце с ключиком", 200, body("mx-nf-heart", "50% 60%", img("girl", "keyheart"))],
  ["Цветочная коробка", 170, body("mx-nf-breathe", "50% 98%", img("girl", "flowers") + star(30, 30, 1.3, 0.2) + star(72, 22, 1.0, 1.1))],
  ["Кольцо в шкатулке", 100, body("mx-nf-ring", "50% 60%", img("girl", "ring") + star(42, 36, 1.4, 0) + star(58, 52, 1.0, 0.9) + star(34, 62, 1.1, 1.6))],
];
const KOLOBOK = [["Колобок", 1000, body("mx-nf-wobble", "50% 98%", img("kolobok", "base"))]];

const items = (name, list) =>
  `const ${name}: Item[] = [\n` + list.map(([n, r, svg]) => `  { name: ${JSON.stringify(n)}, rarity: ${r}, svg: ${JSON.stringify(svg)} },`).join("\n") + "\n];\n\n";

patch("src/lib/messenger/collections.ts", (s) => {
  if (s.includes('make("nft-poop"')) return s;
  const a = s.indexOf("export const BUTTON = make(");
  must(a > 0, "в collections.ts не найден 'export const BUTTON = make('");
  s = s.slice(0, a) + items("POOP_ITEMS", POOP) + items("GIRL_ITEMS", GIRL) + items("KOLOBOK_ITEMS", KOLOBOK) + s.slice(a);
  const re = /export const CIGARS = make\([^\n]*\n/;
  must(re.test(s), "в collections.ts не найден 'export const CIGARS = make('");
  s = s.replace(re, (m) => m + 'export const POOPS = make("nft-poop", "Какашка", POOP_ITEMS);\nexport const GIRLS = make("nft-girl", "Для девушки", GIRL_ITEMS);\nexport const KOLOBOKS = make("nft-kolobok", "Колобок", KOLOBOK_ITEMS);\n');
  const re2 = /\[CIGARS\.id\]: CIGARS,/;
  must(re2.test(s), "в collections.ts не найдена запись [CIGARS.id]: CIGARS");
  return s.replace(re2, "[CIGARS.id]: CIGARS, [POOPS.id]: POOPS, [GIRLS.id]: GIRLS, [KOLOBOKS.id]: KOLOBOKS,");
});

patch("src/lib/messenger/gifts.ts", (s) => {
  if (s.includes('id: "nft-poop"')) return s;
  const lines = s.split("\n");
  const i = lines.findIndex((l) => /\{ id: "nft-cigar"/.test(l));
  must(i >= 0, 'в gifts.ts не найдена строка { id: "nft-cigar" ...');
  const add = [
    '  { id: "nft-poop", emoji: "💩", title: "Какашка", price: 35, category: "nft", nft: true, colors: ["#6a2a5e", "#26102a"], limited: 3000 },',
    '  { id: "nft-girl", emoji: "💝", title: "Для девушки", price: 40, category: "nft", nft: true, colors: ["#5a1f4a", "#220b1c"], limited: 3000 },',
    '  { id: "nft-kolobok", emoji: "😏", title: "Колобок", price: 40, category: "nft", nft: true, colors: ["#5a4010", "#241807"], limited: 1500 },',
  ];
  lines.splice(i + 1, 0, ...add);
  s = lines.join("\n");
  const re = /(new Set\(\[[^\]]*"nft-cigar")/;
  must(re.test(s), "в gifts.ts не найден CURRENT_NFT с nft-cigar");
  return s.replace(re, '$1, "nft-poop", "nft-girl", "nft-kolobok"');
});

// Проверка: все ли нужные CSS-классы анимации есть
const css = fs.readFileSync("src/components/messenger/messenger.css", "utf8");
const need = ["mx-nf-jelly", "mx-nf-breathe", "mx-nf-wobble", "mx-nf-bob", "mx-nf-heart", "mx-nf-ring", "mx-nf-twinkle"];
const missing = need.filter((c) => !css.includes("." + c));
if (missing.includes("mx-nf-wobble")) {
  fs.appendFileSync("src/components/messenger/messenger.css",
    "\n@keyframes mx-nf-wobble { 0%, 100% { transform: rotate(-2deg) scaleY(1); } 50% { transform: rotate(2deg) scaleY(1.02); } }\n.mx-nf-wobble { animation: mx-nf-wobble 2.2s ease-in-out infinite; }\n@media (prefers-reduced-motion: reduce) { .mx-nf-wobble { animation: none !important; } }\n");
  console.log("css: добавлен mx-nf-wobble");
}
const still = missing.filter((c) => c !== "mx-nf-wobble");
if (still.length) console.log("ВНИМАНИЕ: в messenger.css нет классов:", still.join(", "), "— эти анимации не будут двигаться");
console.log("Готово.");

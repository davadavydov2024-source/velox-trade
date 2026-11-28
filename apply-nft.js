// Добавляет коллекции «Какашки», «Для девушки» и «Колобок» в ТЕКУЩИЕ файлы проекта, ничего не затирая.
// Запуск из корня репозитория: node apply-nft.js   (можно запускать повторно)
const fs = require("fs");
const GIFTS = "  // — коллекция «Для девушки» (public/nft/girl/*.webp) и Колобок (public/nft/kolobok/base.webp)\n  { id: \"nft-girl-ring\", emoji: \"💍\", title: \"Кольцо в сердце-шкатулке\", price: 50, category: \"nft\", nft: true, colors: [\"#5a1f6e\", \"#1f0b2a\"], limited: 500 },\n  { id: \"nft-girl-love\", emoji: \"💌\", title: \"Цветочная коробка Love You\", price: 45, category: \"nft\", nft: true, colors: [\"#6a2a5a\", \"#260f22\"], limited: 800 },\n  { id: \"nft-girl-berries\", emoji: \"🍓\", title: \"Клубника в шоколаде\", price: 35, category: \"nft\", nft: true, colors: [\"#5a1f3a\", \"#220b17\"], limited: 2000 },\n  { id: \"nft-girl-key\", emoji: \"❤️\", title: \"Сердце с ключиком\", price: 40, category: \"nft\", nft: true, colors: [\"#5a1a22\", \"#210a0d\"], limited: 1500 },\n  { id: \"nft-girl-web\", emoji: \"💗\", title: \"Сердце в паутинке\", price: 35, category: \"nft\", nft: true, colors: [\"#4f2a6e\", \"#1c0f2a\"], limited: 2000 },\n  { id: \"nft-kolobok\", emoji: \"😏\", title: \"Колобок\", price: 40, category: \"nft\", nft: true, colors: [\"#5a4010\", \"#241807\"], limited: 1500 },\n  // — коллекция «Какашки» (public/nft/poop/*.webp)\n  { id: \"nft-poop-pink\", emoji: \"💩\", title: \"Какашка-принцесса\", price: 35, category: \"nft\", nft: true, colors: [\"#6a2a5e\", \"#26102a\"], limited: 2000 },\n  { id: \"nft-poop-cat\", emoji: \"💩\", title: \"Какашка-кошка\", price: 30, category: \"nft\", nft: true, colors: [\"#3f3a52\", \"#17141f\"], limited: 3000 },\n  { id: \"nft-poop-black\", emoji: \"💩\", title: \"Какашка-байкер\", price: 40, category: \"nft\", nft: true, colors: [\"#2d2536\", \"#100c16\"], limited: 1500 },\n  { id: \"nft-poop-gold\", emoji: \"💩\", title: \"Золотая какашка\", price: 50, category: \"nft\", nft: true, colors: [\"#5a4210\", \"#241a07\"], limited: 500 },\n  { id: \"nft-poop-angel\", emoji: \"💩\", title: \"Какашка-ангел\", price: 50, category: \"nft\", nft: true, colors: [\"#4a4a6e\", \"#181a30\"], limited: 300 },\n";
const IDS = "  \"nft-poop-pink\", \"nft-poop-cat\", \"nft-poop-black\", \"nft-poop-gold\", \"nft-poop-angel\",\n  \"nft-girl-ring\", \"nft-girl-love\", \"nft-girl-berries\", \"nft-girl-key\", \"nft-girl-web\", \"nft-kolobok\",\n";
const FIGS = "// ——— Коллекция «Какашки»: один слой на персонажа (public/nft/poop/<имя>.webp), живёт за счёт движения всего тела и искр.\nconst poopImg = (name: string) => <image href={`/nft/poop/${name}.webp`} x=\"0\" y=\"0\" width=\"100\" height=\"100\" />;\n\nNFT_FIGURES[\"nft-poop-pink\"] = (\n  <>\n    <g className=\"mx-nf mx-nf-jelly\" style={{ transformOrigin: \"50% 98%\" }}>{poopImg(\"pink\")}</g>\n    {nfStar(24, 40, 1.4, 0.2)}{nfStar(78, 30, 1.1, 1.1)}{nfStar(70, 62, 0.9, 1.8)}\n  </>\n);\n\nNFT_FIGURES[\"nft-poop-cat\"] = (\n  <g className=\"mx-nf mx-nf-breathe\" style={{ transformOrigin: \"50% 98%\" }}>\n    {poopImg(\"cat\")}\n  </g>\n);\n\nNFT_FIGURES[\"nft-poop-black\"] = (\n  <g className=\"mx-nf mx-nf-wobble\" style={{ transformOrigin: \"50% 98%\" }}>\n    {poopImg(\"black\")}\n  </g>\n);\n\nNFT_FIGURES[\"nft-poop-gold\"] = (\n  <>\n    <g className=\"mx-nf mx-nf-jelly\" style={{ transformOrigin: \"50% 98%\" }}>{poopImg(\"gold\")}</g>\n    {nfStar(34, 40, 1.6, 0)}{nfStar(62, 48, 1.3, 0.7)}{nfStar(48, 22, 1.1, 1.4)}{nfStar(72, 66, 1.0, 2.0)}\n  </>\n);\n\nNFT_FIGURES[\"nft-poop-angel\"] = (\n  <g className=\"mx-nf mx-nf-bob\">\n    {poopImg(\"angel\")}\n    {nfStar(22, 28, 1.3, 0.3)}{nfStar(80, 24, 1.2, 1.2)}{nfStar(50, 8, 1.0, 1.9)}\n  </g>\n);\n\n// ——— Коллекция «Для девушки» (public/nft/girl/<имя>.webp) и Колобок (public/nft/kolobok/base.webp).\nNFT_FIGURES[\"nft-girl-ring\"] = (\n  <>\n    <g className=\"mx-nf mx-nf-ring\">{nfImg(\"girl\", \"ring\")}</g>\n    {nfStar(42, 36, 1.4, 0)}{nfStar(58, 52, 1.0, 0.9)}{nfStar(34, 62, 1.1, 1.6)}\n  </>\n);\n\nNFT_FIGURES[\"nft-girl-love\"] = (\n  <>\n    <g className=\"mx-nf mx-nf-breathe\" style={{ transformOrigin: \"50% 98%\" }}>{nfImg(\"girl\", \"flowers\")}</g>\n    {nfStar(30, 30, 1.3, 0.2)}{nfStar(72, 22, 1.0, 1.1)}\n  </>\n);\n\nNFT_FIGURES[\"nft-girl-berries\"] = (\n  <g className=\"mx-nf mx-nf-jelly\" style={{ transformOrigin: \"50% 98%\" }}>{nfImg(\"girl\", \"berries\")}</g>\n);\n\nNFT_FIGURES[\"nft-girl-key\"] = (\n  <g className=\"mx-nf mx-nf-heart\" style={{ transformOrigin: \"50% 60%\" }}>{nfImg(\"girl\", \"keyheart\")}</g>\n);\n\nNFT_FIGURES[\"nft-girl-web\"] = (\n  <>\n    <g className=\"mx-nf mx-nf-wobble\" style={{ transformOrigin: \"50% 98%\" }}>{nfImg(\"girl\", \"web\")}</g>\n    {nfStar(30, 34, 1.2, 0.4)}{nfStar(70, 40, 1.4, 1.3)}{nfStar(52, 70, 1.0, 2.0)}\n  </>\n);\n\nNFT_FIGURES[\"nft-kolobok\"] = (\n  <g className=\"mx-nf mx-nf-wobble\" style={{ transformOrigin: \"50% 98%\" }}>{nfImg(\"kolobok\", \"base\")}</g>\n);\n\n";
const CSS = "\n/* NFT-коллекции: парение и покачивание */\n@keyframes mx-nf-bob { 0%, 100% { transform: translateY(1.5px); } 50% { transform: translateY(-2.5px); } }\n@keyframes mx-nf-wobble { 0%, 100% { transform: rotate(-2deg) scaleY(1); } 50% { transform: rotate(2deg) scaleY(1.02); } }\n.mx-nf-bob { animation: mx-nf-bob 2.6s ease-in-out infinite; }\n.mx-nf-wobble { animation: mx-nf-wobble 2.2s ease-in-out infinite; }\n@media (prefers-reduced-motion: reduce) { .mx-nf-bob, .mx-nf-wobble { animation: none !important; } }\n";

function patch(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("без изменений:", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  console.log("обновлён:", file);
}
function must(cond, msg) { if (!cond) { console.error("ОШИБКА:", msg); process.exit(1); } }

patch("src/lib/messenger/gifts.ts", (s) => {
  if (s.includes("nft-kolobok")) return s;
  const i = s.indexOf('{ id: "nft-ringbox"');
  must(i > 0, "в gifts.ts не найден nft-ringbox");
  const ls = s.lastIndexOf("\n", i) + 1;
  s = s.slice(0, ls) + GIFTS + s.slice(ls);
  const re = /"nft-plush",\n/;
  must(re.test(s), "в gifts.ts не найден список CURRENT_NFT");
  return s.replace(re, (m) => m + IDS);
});
patch("src/components/messenger/NftFigures.tsx", (s) => {
  if (s.includes("nft-kolobok")) return s;
  must(/const nfImg\b/.test(s) && /const nfStar\b/.test(s), "в NftFigures.tsx нет nfImg/nfStar");
  const i = s.indexOf("export function NftFigure(");
  must(i > 0, "в NftFigures.tsx не найден NftFigure");
  return s.slice(0, i) + FIGS + s.slice(i);
});
patch("src/components/messenger/messenger.css", (s) => (s.includes("mx-nf-wobble") ? s : s.replace(/\s*$/, "\n") + CSS));
console.log("Готово.");

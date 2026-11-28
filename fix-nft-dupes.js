// Убирает дубли коллекций «Какашки» / «Для девушки» / «Колобок» в gifts.ts и NftFigures.tsx.
// Запуск из корня репозитория: node fix-nft-dupes.js   (можно запускать повторно)
const fs = require("fs");

function patch(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("без изменений:", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  console.log("исправлен:", file);
}

// gifts.ts: оставляем первую строку каждого NFT-подарка из новых коллекций, повторы и повторные комментарии убираем
patch("src/lib/messenger/gifts.ts", (s) => {
  const seen = new Set();
  const comments = new Set();
  return s.split("\n").filter((line) => {
    const m = line.match(/^\s*\{ id: "(nft-poop-[a-z]+|nft-girl-[a-z]+|nft-kolobok)"/);
    if (m) { if (seen.has(m[1])) return false; seen.add(m[1]); return true; }
    const c = line.match(/^\s*\/\/ — коллекция «(Какашки|Для девушки)»/);
    if (c) { if (comments.has(c[1])) return false; comments.add(c[1]); return true; }
    return true;
  }).join("\n");
});

// NftFigures.tsx: если блок «Какашки» встречается больше одного раза, убираем лишние (от маркера до следующего блока)
patch("src/components/messenger/NftFigures.tsx", (s) => {
  const START = "// ——— Коллекция «Какашки»";
  const NEXT = ["// ——— Коллекция «Для девушки»", "export function NftFigure("];
  for (let guard = 0; guard < 5; guard++) {
    const first = s.indexOf(START);
    const second = first < 0 ? -1 : s.indexOf(START, first + 1);
    if (second < 0) break;
    let end = -1;
    for (const n of NEXT) { const i = s.indexOf(n, second + 1); if (i >= 0 && (end < 0 || i < end)) end = i; }
    if (end < 0) { console.error("ОШИБКА: не нашёл конец дублирующего блока"); process.exit(1); }
    s = s.slice(0, second) + s.slice(end);
  }
  const girl = "// ——— Коллекция «Для девушки»";
  for (let guard = 0; guard < 5; guard++) {
    const first = s.indexOf(girl);
    const second = first < 0 ? -1 : s.indexOf(girl, first + 1);
    if (second < 0) break;
    const end = s.indexOf("export function NftFigure(", second);
    s = s.slice(0, second) + s.slice(end);
  }
  return s;
});
console.log("Готово.");

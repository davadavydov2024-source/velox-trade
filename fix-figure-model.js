// Разрешает NftFigure принимать необязательное свойство model (его передаёт GiftTile.tsx).
// Запуск из корня репозитория: node fix-figure-model.js   (можно запускать повторно)
const fs = require("fs");
const file = "src/components/messenger/NftFigures.tsx";
const raw = fs.readFileSync(file, "utf8");
const re = /export function NftFigure\(\{ id \}: \{ id: string \}\)/;
if (!re.test(raw)) {
  console.log(/export function NftFigure\([^)]*model/.test(raw) ? "уже исправлено" : "ОШИБКА: сигнатура NftFigure выглядит иначе, пришли строку 'export function NftFigure' из файла");
  process.exit(0);
}
fs.writeFileSync(file, raw.replace(re, "export function NftFigure({ id }: { id: string; model?: string })"), "utf8");
console.log("исправлен:", file);

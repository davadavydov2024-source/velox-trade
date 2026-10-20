#!/usr/bin/env node
// Переносит запись «прочитано» (readBy) на сервер, чтобы у отправителя появлялись две галочки.
// Запуск из корня репозитория: node patch-chatread.js
const fs = require("fs");
const file = "src/lib/chatRead.ts";
let s = fs.readFileSync(file, "utf8");
if (s.includes("/api/chats/read")) {
  console.log("chatRead.ts уже исправлен");
  process.exit(0);
}
const re = /(\s*)await updateDoc\(doc\(db, col, id\), \{ \[`readBy\.\$\{readerKey\}`\]: lastMessageAt \}\);/;
if (!re.test(s)) {
  console.error("Не нашёл строку записи readBy в chatRead.ts — файл изменён; пришли его, поправлю вручную.");
  process.exit(1);
}
s = s.replace(
  re,
  (m, ws) =>
    `${ws}// Сначала через сервер: он не зависит от правил Firestore и проверяет, что человек участник чата.` +
    `${ws}const res = await authedFetch("/api/chats/read", { method: "POST", body: JSON.stringify({ col, id, readerKey, lastMessageAt }) });` +
    `${ws}if (!res.ok) await updateDoc(doc(db, col, id), { [\`readBy.\${readerKey}\`]: lastMessageAt });`
);
if (!/authedFetch\s*\}\s*from/.test(s)) {
  s = s.replace(/(import \{ db \} from "\.\/firebase";)/, `$1\nimport { authedFetch } from "./authedFetch";`);
}
fs.writeFileSync(file, s);
console.log("chatRead.ts исправлен. Теперь: npm run build");

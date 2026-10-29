// Чинит «РџРѕРєР°…» -> «Пока…» (UTF-8, прочитанный как windows-1251). Запуск: node fix-mojibake.js [папка]
const fs = require("fs"), path = require("path");
const dec1251 = new TextDecoder("windows-1251");
const rev = new Map();
for (let b = 0; b < 256; b++) { const ch = dec1251.decode(new Uint8Array([b])); if (!rev.has(ch)) rev.set(ch, b); }
rev.set("\u0098", 0x98);
const utf8 = new TextDecoder("utf-8", { fatal: true });
const runRe = /[\u0080-\u00FF\u0400-\u04FF\u0490\u0491\u2010-\u203A\u20AC\u2116\u2122]+/g; // символы, возможные в такой «каше»
function fixRun(run) {
  if (!/[РС\u0440\u0441]/.test(run)) return run;
  const bytes = [];
  for (const ch of run) { if (!rev.has(ch)) return run; bytes.push(rev.get(ch)); }
  try { const out = utf8.decode(new Uint8Array(bytes)); return out; } catch { return run; }
}
let changed = 0;
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (f === "node_modules" || f === ".next" || f === ".git") continue;
    const p = path.join(d, f), st = fs.statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!/\.(tsx?|css|json|md)$/.test(f)) continue;
    const s = fs.readFileSync(p, "utf8");
    const t = s.replace(runRe, fixRun);
    if (t !== s) { fs.writeFileSync(p, t, "utf8"); console.log("исправлен:", p); changed++; }
  }
}
walk(process.argv[2] || "src");
console.log("готово, файлов исправлено:", changed);

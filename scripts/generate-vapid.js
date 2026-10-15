// Генерирует пару VAPID-ключей для push-уведомлений. Запуск: node scripts/generate-vapid.js
// Скопируй в Vercel ТОЛЬКО две строки ниже: публичный ключ -> NEXT_PUBLIC_VAPID_PUBLIC_KEY,
// приватный -> VAPID_PRIVATE_KEY (только на сервере, никому не показывать).
// VAPID_SUBJECT задавать не нужно; если задаёшь — строго вида mailto:почта@домен.ru или https://сайт
// (без пробелов и пояснений: iPhone/Apple отклоняет push с некорректным значением).
const crypto = require("crypto");
const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
const priv = ecdh.getPrivateKey();
const padded = priv.length < 32 ? Buffer.concat([Buffer.alloc(32 - priv.length), priv]) : priv;
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + ecdh.getPublicKey().toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + padded.toString("base64url"));

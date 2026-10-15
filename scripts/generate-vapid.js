// Генерирует пару VAPID-ключей для push-уведомлений. Запуск: node scripts/generate-vapid.js
// Публичный ключ — в NEXT_PUBLIC_VAPID_PUBLIC_KEY, приватный — в VAPID_PRIVATE_KEY (ТОЛЬКО на сервере, никому не показывать).
const crypto = require("crypto");
const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
const priv = ecdh.getPrivateKey();
const padded = priv.length < 32 ? Buffer.concat([Buffer.alloc(32 - priv.length), priv]) : priv;
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + ecdh.getPublicKey().toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + padded.toString("base64url"));
console.log("VAPID_SUBJECT=mailto:твоя-почта@example.com   (необязательно, но желательно)");

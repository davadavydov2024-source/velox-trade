# Патч безопасности (blade-shop)

Распаковать поверх проекта (папка src/ — поверх src/, firestore.rules и storage.rules — в корень).

## Обязательно перед деплоем
1. Vercel → Environment Variables: задать CRON_SECRET (любая длинная случайная строка) — без него крон-роуты теперь отвечают 401.
2. Задать TELEGRAM_WEBHOOK_SECRET и переустановить вебхук:
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<сайт>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
   Без секрета вебхук теперь отклоняет все запросы (иначе его можно подделать).
3. Задеплоить правила: firebase deploy --only firestore:rules,storage

## Что изменено
См. список в ответе в чате.

## Конфиденциальность чатов
- components/ChatPrivacyShield.tsx — размытие при потере фокуса/скриншот-клавишах, запрет копирования и печати, водяной знак.
- lib/chatSecrets.ts + components/ChatMessageBody.tsx — пароли/коды в сообщениях прячутся за кнопкой (10 с), в уведомлениях маскируются.
- Системный скриншот и съёмку экрана камерой веб-сайт запретить не может.

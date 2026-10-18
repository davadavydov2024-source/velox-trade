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

## Чаты
- Пароли/коды маскируются (••••) в уведомлениях (lib/chatSecrets.ts).
- components/ScrollToBottomButton.tsx — стрелка «вниз» в чатах.

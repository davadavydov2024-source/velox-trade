# Безопасность Velox Trade — что сделано и что нужно сделать вручную

## Сделано в коде (этот архив)
1. **Сброс пароля** (`api/auth/send-reset-email`): раньше отдавал ссылку сброса прямо в ответе — по email любого человека (в т.ч. админа) можно было захватить аккаунт. Теперь ссылка уходит только письмом, ответ всегда одинаковый, есть лимиты.
2. **Уведомления `notify/telegram`, `notify/email`, `notify/admin`, `notify/push`, `admin/notify-dispute`, `admin/notify-sell-request`**: были открыты всем (фишинг «от имени сайта», спам админам). Теперь нужен вход в аккаунт, лимиты частоты, вырезание чужих ссылок, очистка HTML писем.
3. **Telegram-вебхук**: без `TELEGRAM_WEBHOOK_SECRET` теперь отказывает (иначе можно было подделать «оплату» и получить звёзды/баланс бесплатно).
4. **Cron** (`release-payouts`, `reminders`): без `CRON_SECRET` теперь отказывает (раньше мог запустить любой).
5. **Загрузка файлов**: список разрешённых папок, проверка настоящего содержимого (не только заголовка), SVG только админам, лимит загрузок.
6. **Коды из писем/Telegram** — криптостойкий генератор, лимиты по IP и адресу.
7. **storage.rules** — всё закрыто (Firebase Storage не используется).

## Обязательно сделать руками (иначе часть защит остановит работу)
1. В Vercel → Environment Variables задай:
   - `CRON_SECRET` — любая длинная случайная строка (Vercel сам подставит её при вызове cron);
   - `TELEGRAM_WEBHOOK_SECRET` — длинная случайная строка (A–Z, a–z, 0–9, `_`, `-`).
2. Перерегистрируй вебхук бота с этим секретом (PowerShell, подставь значения):
   `Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot<ТОКЕН_БОТА>/setWebhook" -Body @{ url = "https://velox-trade-zeta.vercel.app/api/telegram/webhook"; secret_token = "<TELEGRAM_WEBHOOK_SECRET>" }`
3. Задеплой `storage.rules` (Firebase Console → Storage → Rules) — там теперь всё закрыто.
4. **Пришли `firestore.rules`** — это главное, что я не видел. Проверь/попроси проверить, что:
   - при создании `users/{uid}` нельзя поставить `balance`, `starsBalance`, `starsWallet`, `badges`, `staffRole`, `banned` и т.п. (должны быть 0 / `["user"]` / отсутствовать);
   - владелец может менять в своём профиле ТОЛЬКО безопасные поля (`displayName`, `photoURL`, `bio`, `username`, `language`, `lastLoginAt`, `lastNameChangeAt`, `lastAvatarChangeAt`, …), но не баланс, метки, роли, бан, рейтинг, рефералы;
   - коллекции `orders`, `payments`, `starsInvoices`, `starsTopups`, `starsWalletLog`, `webPushSubs`, `rateLimits`, `adminAuditLog`, `telegramLinks`, `sessions` недоступны для записи с клиента;
   - чужие `users`, `orders`, `directConversations`, `orderChats` не читаются.
5. Включи TTL-политику для коллекции `rateLimits` по полю `expireAt` (Firebase Console → Firestore → TTL) — чтобы старые записи лимитов чистились сами.
6. Заголовки безопасности (`next.config.js`) — пришли файл, добавлю HSTS, X-Frame-Options, Referrer-Policy и переведу CSP из режима «только отчёт» в рабочий.
7. Включи двухфакторную защиту на админских аккаунтах и на Vercel/Firebase/GitHub/Telegram, смени пароли и ключи, если они попадали в чаты/скриншоты (в том числе Client Secret Telegram из прошлого сообщения).

## Честно про «никто никак не взломает»
100% защиты не бывает. Выше — реальные дыры, найденные в коде. Самые важные для проверки остались в правилах Firestore (п.4).

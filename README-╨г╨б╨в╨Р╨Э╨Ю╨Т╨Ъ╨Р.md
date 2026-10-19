# Полный набор изменений Velox Trade (всё сразу)

Этот архив ОБЪЕДИНЯЕТ все предыдущие архивы: в нём последняя версия каждого изменённого файла.
Распаковывать в КОРЕНЬ репозитория (рядом с папкой `src`), согласившись на замену файлов:
- `src/...` — код сайта (новые и изменённые файлы);
- `public/push-sw.js`, `public/icons/*` — service worker для push и новая иконка приложения;
- `scripts/generate-vapid.js` — генератор VAPID-ключей;
- `storage.rules` — правила Firebase Storage (всё закрыто);
- `SECURITY-CHECKLIST.md` — что сделать вручную.

## Удалить вручную (больше не используется)
- `public/firebase-messaging-sw.js`

## Переменные окружения в Vercel (Environment Variables)
- Push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (пара: `node scripts/generate-vapid.js`), `VAPID_SUBJECT` — по желанию (строго `mailto:почта@домен.ru` или `https://сайт`)
- Telegram-вход: `TELEGRAM_OIDC_CLIENT_ID`, `TELEGRAM_OIDC_CLIENT_SECRET`, `NEXT_PUBLIC_SITE_URL`
- Безопасность: `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET` (и перерегистрация вебхука — см. SECURITY-CHECKLIST.md)
- ИИ (модерация и категории игр): `GEMINI_API_KEY` и/или `ANTHROPIC_API_KEY`

Список файлов — в `_lists.txt` (новые и изменённые).

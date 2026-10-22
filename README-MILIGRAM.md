# Админка MiliGram + связка с Velox Trade

Распаковать поверх проекта (папка `src/` — поверх `src/`). Новые файлы, ничего существующего не перезаписывает.

## Вручную добавить пункт меню
В `src/app/admin/layout.tsx` в массив `NAV` (и `Smartphone` в импорт из lucide-react):
`{ href: "/admin/miligram", label: "MiliGram", icon: Smartphone },`

## Firestore
Новые коллекции только серверные (Admin SDK): `miligramProfiles`, `miligramDevices`, `miligramLinkCodes`, `settings/miligram`.
В `firestore.rules` для них НЕ нужно давать доступ — если нет явного `match`, клиенту всё закрыто. Проверь, что нет
общего `match /{document=**} { allow ... }`.

## Как это связано
1. Пользователь Velox (с привязанным Telegram) на `/profile/miligram` получает код (10 симв., 10 минут, одноразовый).
2. Приложение шлёт код на `POST /api/miligram/link/claim` -> получает токен устройства. Telegram-id берётся из `telegramLinks`.
3. Приложение запрашивает `GET /api/miligram/config` (флаги, версия, объявление) и `POST /api/miligram/profiles` с токеном
   (оформление других пользователей по их Telegram-id).
4. Админ в `/admin/miligram` выдаёт бейджи, градиент, обводку, баннер, баны, включает функции и пишет объявление.

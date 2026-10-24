# Velox Chat — интерфейс (сессия B), версия без пересечений с другими файлами

Чтобы не затирать чужие файлы, всё лежит в НОВЫХ, уникальных путях:
- `src/components/vchat/**` — весь UI (префикс стилей и ключей `vc-`)
- `src/app/vc/**` — страницы: `/vc` (приложение), `/vc/start` (вход и регистрация), `/vc/manifest.webmanifest`
- `public/vc/*` — иконки (из miligram-avatar.png)

Ничего из `src/components/messenger/**`, `src/app/m/**`, `public/m/**` этот архив не трогает.
Проверено на копии проекта: `tsc` без ошибок, `next build` проходит (`/vc`, `/vc/start`, `/vc/manifest.webmanifest`).

## Две правки в чужих файлах
1. `Footer.tsx` — обернуть логотип: `import { MessengerEntry } from "@/components/vchat/MessengerEntry";` →
   `<MessengerEntry><img .../></MessengerEntry>` (5 нажатий → «Код доступа», затем открывается `/vc/start`).
2. `src/lib/securityHeaders.ts` — `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`.

## Зависимость от сессии A
`ALLOWED_REACTIONS` из `@/lib/messenger/types` (файл должен существовать и экспортировать этот список).
Флаг `MX_FEATURES.upload` в `components/vchat/features.ts` (сейчас false): голосовые, видеокружки, видео и файлы включатся, когда
появится `POST /api/messenger/upload`. Остальной контракт и список вызываемых эндпоинтов — как в предыдущей версии заметок
(gate/register/join, typing-подколлекция, uploadImage для фото, локальное скрытие «у себя»).

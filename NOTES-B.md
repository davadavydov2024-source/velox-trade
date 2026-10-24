# Velox Chat — интерфейс (сессия B)

Проверено на копии вашего проекта: `tsc --noEmit` без ошибок, `next build` проходит (`/m`, `/m/start`, `/m/manifest.webmanifest`).

## Что внутри (только новые файлы, чужие не перезаписываются)
- `src/app/m/**` — layout (PWA-мета iOS), `/m`, `/m/start`, `manifest.webmanifest`
- `src/components/messenger/**` — весь UI + `messenger.css`
- `public/m/*` — иконка «улыбающийся пузырь» (из miligram-avatar.png): 192/512, maskable, apple-touch-icon, logo.png
`/m` открывается поверх сайта на весь экран, Header и MobileTabBar сайта не правятся.

## Зависимость от сессии A
Интерфейс импортирует `ALLOWED_REACTIONS` из `@/lib/messenger/types` (реакции только из этого списка;
двойной тап = ❤️, если он в списке, иначе первая реакция). Файл должен существовать в проекте.

## Как устроен контракт (по сообщению сессии A)
- Вход: `gate {code}` → `register {gateToken,email,password,handle,displayName}` → `signInWithEmailAndPassword` → клиент шлёт
  `sendEmailVerification` (экран «Подтверди почту», можно пропустить). Уже вошедший на сайте: `join {gateToken,handle,displayName}`.
- Чтение: `messengerChats` (array-contains, без orderBy, сортировка на клиенте), `…/messages` (orderBy createdAt),
  `messengerUserChats/{uid}/chats` (unread), `messengerAccounts/{uid}`.
- «Печатает»: подколлекция `messengerChats/{id}/typing`, свежо — `at` не старше 5 с; `POST typing` не чаще раза в 3 с.
- Фото до этапа upload: существующий `uploadImage` (Vercel Blob), перед отправкой сжимаются до 1920 px. Флаг `MX_FEATURES.upload`
  в `components/messenger/features.ts` (сейчас `false`): голосовые, видеокружки, видео, файлы и видео в историях скрыты.
  Когда A выкатит `POST /api/messenger/upload` — поставить `true`.
- «Удалить у себя» в API нет — сообщение скрывается локально (localStorage). «Удалить у всех» — `delete {chatId,msgId}`.

## Эндпоинты, которые интерфейс вызывает, но в сообщении A не описаны (проверьте имена и формы)
`chats` (создать dm/группу/канал → `{chatId}`), `chats/members {chatId,add?,remove?}`, `chat-settings {chatId,pinned?,archived?,muted?,mutedUntil?,folderIds?}`,
`send {chatId,kind,text?,mediaUrl?,mediaUrls?,width?,height?,replyTo?:{msgId}}` → `{id}`, `edit {chatId,msgId,text}`,
`read {chatId}`, `react {chatId,msgId,emoji}`, `pin {chatId,msgId,pinned}`, `forward {fromChatId,msgIds,toChatIds}`,
`profile {displayName,handle,bio,birthday,photoURL,showLastSeen}`, `folders {action,folder?,folderId?}`, `GET search?q=` → `{accounts}`,
`GET/POST/DELETE stories`, `stories/view {storyId}`, `POST presence` (раз в минуту, для «в сети»; ошибки игнорируются).

## Две правки в чужих файлах
1. `Footer.tsx` — обернуть логотип: `<MessengerEntry><img .../></MessengerEntry>` (5 нажатий → «Код доступа»).
2. `src/lib/securityHeaders.ts` — `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`
   (сейчас стоит `camera=(), microphone=()` — запись голоса и видеокружков не заработает после включения upload).

## Не сделано
Поиск по тексту сообщений, жалобы и блокировка пользователей (нет API), шифрование сквозное (сообщения читаются сервером — сказано в «Конфиденциальность»).

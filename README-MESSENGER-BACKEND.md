# Мессенджер Velox — бэкенд, этапы 1–3 (сессия A)

Распаковать поверх проекта (`src/` поверх `src/`). Только новые файлы + обновлены `edit`, `send`, `forward`, `chats`, `lib/messenger/server.ts`, `types.ts` из этапа 1.

## Vercel -> Environment Variables
- `MESSENGER_ACCESS_CODE` — код доступа; `MESSENGER_GATE_SECRET` — случайная строка от 16 символов. `BLOB_READ_WRITE_TOKEN` уже есть.
## Firestore
Заново вставить `firestore-rules-messenger-snippet.txt` (добавлены stories/reports/blocks) и задеплоить правила.
## Админка
В `src/app/admin/layout.tsx` в `NAV` добавить `{ href: "/admin/messenger", label: "Мессенджер", icon: MessageSquare }` (иконка из lucide-react).

## API (всё с Bearer idToken, кроме gate/register/upload)
Этап 1: gate, register, join, chats, send, read, react, pin, forward, edit, delete, typing, search, profile.
Этап 2: `upload-ticket` + `upload` (прямая загрузка в Vercel Blob), send теперь принимает voice / videoNote / file, каналы (`chats` type=channel, пишут только админы),
`members` (add/remove/leave/promote/demote), `chat-info`, `chat-settings` (закреп чата ≤5, архив, без звука, папки), `folders` (≤10).
Этап 3: `stories` (GET/POST/DELETE) + `stories/view`, `report`, `block`, админка `/admin/messenger` (статистика, жалобы, бан, галочка).

## Загрузка медиа (для сессии B)
1. `POST /api/messenger/upload-ticket { kind }` -> `{ ticket, pathPrefix, maxBytes, contentTypes }`
   kind: image | voice | videoNote | file | story-image | story-video | avatar
2. Прямая загрузка (npm-пакет `@vercel/blob` уже в проекте):
   `import { upload } from "@vercel/blob/client"; const blob = await upload(pathPrefix + name, file, { access: "public", handleUploadUrl: "/api/messenger/upload", clientPayload: ticket });`
3. `blob.url` -> в `send { kind, mediaUrl, duration?, waveform?, width?, height? }`, `stories`, `profile.photoURL`, `chat-info.photoURL`.
Лимиты: фото 10 МБ, голос 5 МБ (≤10 мин), видеокружок 15 МБ (≤60 с), история-видео 25 МБ, файл 20 МБ (pdf/zip/txt).
Запись в браузере: `MediaRecorder`; на iOS Safari голос — `audio/mp4`, видео — `video/mp4`; на Chrome — `audio/webm`, `video/webm`. Формат берите из `recorder.mimeType`.
Чтение: списки папок — `messengerUserFolders/{uid}/folders`; настройки чатов — `messengerUserChats/{uid}/chats`. Истории — только через `GET /api/messenger/stories` (опрос раз в 30–60 с).
Отправитель блокировки получает 403 «Нельзя писать этому пользователю». В канале не-админ получает 403.

## Известные ограничения
Тип загруженного файла проверяется по заявленному content-type (прямая загрузка в Blob не даёт проверить байты); отдаются файлы только как audio/video/image/pdf/zip/txt, HTML и SVG запрещены.
Нет: «удалить только у себя» на сервере, поиск по сообщениям, сквозное шифрование.

---
# Обновление 3: папки, каналы как в Telegram, Mili Premium, стикеры

## Папки (`lib/messenger/folders.ts`, общий для всех экранов)
Чат может лежать сразу в нескольких папках. Правила папки: `includeTypes` (`dm`/`group`/`channel` — все чаты этого типа, включая НОВЫЕ; `unread` — любой чат с непрочитанными)
и ручной список (`chatIds` / `folderIds` у чата). Новое сообщение или новый чат сами появляются во всех подходящих папках без ручных действий.
Функции: `chatInFolder`, `foldersForChat`, `folderUnread` (бейдж вкладки), `allUnread` (вкладка «Все»; архив и чаты «без звука» в бейдж не входят).

## Каналы
- `chats { type:"channel", title, description?, handle? }` — с `handle` канал публичный (@адрес, поиск, вход по ссылке), без — приватный (вход по пригласительной ссылке).
- `channel-search?q=` — поиск публичных каналов. `channel-preview?handle=` / `?code=` — карточка (название, описание, подписчики, `isMember`) и 20 последних постов публичного канала ДО подписки.
- `join-chat { handle }` или `{ code }` — подписаться/вступить; выйти — `members { action:"leave" }`. Лимит: канал 5000, группа 200.
- `invite { chatId, action:"create"|"revoke" }` — пригласительная ссылка `/m?join=<code>` (для публичного канала: `/m?join=@handle`). Страница `/m` читает `?join=` и показывает карточку с кнопкой «Подписаться».
- Посты: пишут только админы. Просмотры: `channel-view { chatId, msgIds[] }` вызывать, когда пост попал в экран (один человек = один просмотр); число в `messages/{id}.views`. Реакции — обычные.
- Не сделано: комментарии к постам (обсуждения), планирование постов.

## Mili Premium
- Цена и срок: `lib/messenger/premium.ts` — **10 ⭐ на 30 дней** (меняется одной константой). Оплата с кошелька ⭐ на сайте (`users.starsWallet`, пополнение — страница «Пополнение ⭐»).
- `GET /api/messenger/premium` -> `{ premium, premiumUntil, priceStars, days, wallet }`; `POST { action:"buy" }` — купить/продлить (ошибка 402 `needTopup:true`, если не хватает ⭐).
- Premium активен, пока `messengerAccounts/{uid}.premiumUntil > Date.now()` (поле читается клиентом — для значка ⭐ у имени).
- Что даёт: премиум-стикеры, папок 20 вместо 10, закреплённых чатов 10 вместо 5. Админ может выдать Premium в `/admin/messenger` (кнопка «⭐ +30 дн.»).
## Стикеры
- Набор создаёт админ в `/admin/messenger` (раздел «Стикеры Mili»: PNG/WEBP/GIF/WEBM до 512 КБ, анимированные — WEBM/GIF/WEBP; флажки «Только Mili Premium» и «Опубликован»).
- Ссылка набора: `/m?stickers=<slug>`. Клиент открывает карточку: `GET /api/messenger/stickers?slug=` -> `{ pack, added, locked }`, кнопка «Добавить» -> `POST { slug, action:"add" }`.
  Премиум-набор без Premium: 403 `needPremium:true` (показать предложение купить).
- Мои наборы: `GET /api/messenger/stickers`. Отправка: `send { kind:"sticker", stickerPack, stickerIndex }`; сообщение хранит `sticker: { pack, index }` и `mediaUrl`.
  Премиум-стикер без Premium отправить нельзя (403 `needPremium`), увидеть чужой — можно всем.
## Что сделать вам
Распаковать архив поверх проекта, заново вставить `firestore-rules-messenger-snippet.txt`, задеплоить. Новых переменных не нужно.

# Velox Chat — интерфейс (сессия B): что сделано и что нужно от A

Собрано и проверено на вашем проекте: `tsc --noEmit` без ошибок, `next build` проходит
(страницы `/m`, `/m/start`, `/m/manifest.webmanifest`).

## Файлы (только новые — чужие файлы не перезаписываются)
- `src/app/m/**` — layout (PWA-мета iOS), `/m` (приложение), `/m/start` (вход и регистрация), `manifest.webmanifest`
- `src/components/messenger/**` — весь UI + `messenger.css`
- `public/m/*` — иконки 192/512/maskable и apple-touch-icon

`/m` открывается поверх сайта на весь экран (`position: fixed`, z-index 9000), поэтому Header и MobileTabBar
сайта скрыты **без правки их файлов**.

## 3 обязательные правки в чужих файлах (по одной строке)
1. **Скрытый вход** — `src/components/Footer.tsx`: обернуть логотип
   ```tsx
   import { MessengerEntry } from "@/components/messenger/MessengerEntry";
   ...
   <MessengerEntry>
     <img src="/icons/velox-mark.svg" alt="" width={30} height={30} className="w-[30px] h-[30px] rounded-[9px]" />
   </MessengerEntry>
   ```
   5 быстрых нажатий → шторка «Код доступа».
2. **Микрофон и камера** — `src/lib/securityHeaders.ts`: сейчас `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   полностью запрещает запись голоса и видеокружков. Заменить на
   `"camera=(self), microphone=(self), geolocation=()"`.
3. (по желанию) в Report-Only CSP добавить `media-src 'self' blob: https://*.vercel-storage.com`.

## Что нужно от сессии A (допущения интерфейса — формы запросов)
Все запросы: `/api/messenger/<path>`, `Authorization: Bearer <idToken>`, ошибки `{ error }` на русском.

| Путь | Тело | Ответ |
|---|---|---|
| `POST gate` | `{ code }` | `{ gateToken }` |
| `POST register` | `{ gateToken, email, password, handle, displayName }` | `{ ok }` (клиент затем входит `login(email, password)`) |
| `POST join` | `{ gateToken, handle, displayName }` | `{ ok }` |
| `POST chats` | `{ type, members: uid[], title?, description? }` (dm — идемпотентно, вернуть существующий) | `{ chatId }` |
| `POST chats/members` | `{ chatId, add?: uid[], remove?: uid[] }` | `{ ok }` |
| `POST chat-settings` | `{ chatId, pinned?, archived?, muted?, mutedUntil?, folderIds? }` | `{ ok }` |
| `POST send` | `{ chatId, kind, text?, mediaUrl?, mediaUrls?, duration?, waveform?, width?, height?, replyTo?: { msgId } }` — **replyTo.from/preview заполняет сервер** | `{ id }` |
| `POST edit` | `{ chatId, msgId, text }` | `{ ok }` |
| `POST delete` | `{ chatId, msgId, msgIds: [msgId], forAll }` | `{ ok }` |
| `POST read` / `typing` / `react` / `pin` / `forward` | как в контракте | `{ ok }` |
| `POST upload` | multipart: `file`, `kind` (`image`\|`voice`\|`videoNote`\|`story`\|`avatar`\|`file`), `duration?` | `{ url, width?, height? }` |
| `GET stories` | — | `{ stories: MStory[] }` |
| `POST stories` | `{ kind, mediaUrl, caption? }`; `DELETE stories` `{ storyId }`; `POST stories/view` `{ storyId }` | `{ ok }` |
| `GET search?q=` | — | `{ accounts: MAccount[] }` |
| `POST profile` | любые из: `displayName, handle, bio, birthday, photoURL, showLastSeen` | `{ ok }` |
| `POST folders` | `{ action: "create"\|"update"\|"delete", folder?, folderId? }` | `{ ok }` |
| `POST presence` | `{}` — раз в минуту, пока вкладка видна (или обновлять `lastSeenAt` на любом запросе) | `{ ok }` |

Дополнительные ожидания по данным:
- `messengerChats/{id}.typing: { [uid]: timestampMs }` — пишет `POST typing` (интерфейс считает «печатает…», если < 6 с).
- Видео из галереи отправляется как `kind: "image"` с `mediaUrl` на `.mp4/.mov/.webm` (клиент рисует `<video>`); upload с `kind=image` должен
  принимать видео до 25 МБ (или добавьте kind `"video"` — скажите, поменяю).
- Для kind `file` имя файла лежит в `text`.
- Подтверждение почты при регистрации использует существующие `/api/auth/email-code/send` и `/confirm`;
  `register` может дополнительно проверять, что почта подтверждена (`emailVerificationCodes/{email}.verified`).
- Аккаунты: `messengerAccounts/{uid}` читается любым участником мессенджера (имена/фото в списках).
- Типы: у меня локальная копия `components/messenger/mtypes.ts`; когда появится `lib/messenger/types.ts`, заменить реэкспортом.

## Что работает в интерфейсе
Этап 1–3 по контракту: скрытый вход, регистрация/вход, личные чаты, группы и каналы, текст/фото/видео/файлы, ответы, реакции
(двойной тап = ❤️), пересылка, закрепы (несколько), правка, удаление (у меня / у всех), выбор нескольких, голосовые (удержание,
свайп влево — отмена, вверх — зафиксировать, волна, скорость 1×/1.5×/2×), видеокружки (запись до 60 с), «печатает…», черновики,
кнопка «вниз» со счётчиком, папки, архив, без звука, свайпы и контекстное меню в списке, поиск людей/чатов, истории
(создание, просмотр, пауза, ответ, просмотревшие), настройки (профиль, тема/акцент/размер текста, устройства, конфиденциальность),
PWA (manifest, иконки, мета iOS, бейдж на иконке), пуши включаются через `PushToggleCard` (категория `messages`).

## Не сделано / ограничения
- Поиск **по тексту сообщений** (нужен API) — сейчас ищутся чаты и люди.
- Жалобы на сообщения и блокировка пользователей — этап 3 по контракту, API жалоб в контракте нет.
- Клик по пушу должен открывать `/m?chat=<chatId>` (A кладёт в payload).
- Сообщения не шифруются сквозным образом — об этом сказано в «Конфиденциальность»; впишите и в правила сайта.

# Мессенджер Velox — бэкенд, этап 1 (сессия A)

Распаковать поверх проекта (`src/` поверх `src/`). Только новые файлы.

## Vercel → Environment Variables
- `MESSENGER_ACCESS_CODE` — секретный код доступа (его вводят внизу сайта).
- `MESSENGER_GATE_SECRET` — любая случайная строка от 16 символов (подписывает временный токен после ввода кода).
Без обеих `POST /api/messenger/gate` отвечает 503. После добавления — передеплой. Сменить код = поменять переменную и передеплоить.

## Firestore
Вставить `firestore-rules-messenger-snippet.txt` в `firestore.rules` и задеплоить правила. Индексы вручную не нужны.

## Готово (этап 1)
gate, register, join, chats (dm/группа), send (текст, фото, ответ), read, react, pin, forward, edit, delete (у всех), typing, search, profile + пуши.
НЕТ пока: голосовые/видеокружки и `upload`, каналы, папки/архив/mute (`chat-settings`), истории, админка (этапы 2–3).

## Для сессии B (интерфейс)
- Везде `Authorization: Bearer <idToken>`, кроме `gate` и `register`.
- Вход: `gate {code}` → `gateToken`; `register {gateToken,email,password,handle,displayName}`; затем обычный `signInWithEmailAndPassword`.
  Уже вошедший на сайте: `join {gateToken,handle,displayName}`. Письмо подтверждения почты шлёт клиент (`sendEmailVerification`).
- Чтение напрямую (`onSnapshot`): `messengerChats` (`where("members","array-contains",uid)`, БЕЗ orderBy — сортировать на клиенте по `updatedAt`),
  `messengerChats/{id}/messages` (`orderBy("createdAt")`), `messengerUserChats/{uid}/chats/{chatId}` (unread), `messengerAccounts/{uid}`.
- «Печатает»: слушать `messengerChats/{id}/typing`, свежим считать `at` не старше 5 с; слать `POST typing` не чаще раза в 3 с.
- Фото пока только ссылкой из Vercel Blob (`*.public.blob.vercel-storage.com`): до `upload` (этап 2) использовать существующий `uploadImage`.
- Реакции только из `ALLOWED_REACTIONS` (`lib/messenger/types.ts`). Ошибки: `{ error }` на русском, можно показывать как есть.
- «Удалить у себя» в API нет: скрывать сообщение локально.

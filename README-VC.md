# MiliGram (мой интерфейс) — отдельная версия по адресу /vc

Папки — новые, чужие файлы не перезаписываются:
- src/components/vchat/**   — интерфейс
- src/app/vc/**             — страницы (/vc, /vc/start → редирект на /vc)
- public/vc/**              — иконки и манифест PWA (scope /vc)
- src/app/polish.css        — мягкая шлифовка дизайна всего сайта (подключается одной строкой в layout.tsx)

Использует вашу библиотеку бэкенда: lib/messenger/{client,types,uploads,premium}.ts
(mApi, uploadMedia, getDeviceId, типы MessengerAccount/Chat/Message/UserChat/Folder/Story,
 DEFAULT_PERMISSIONS, ALLOWED_REACTIONS, UPLOAD_KINDS, isPremium).

## Что в этом обновлении (включает предыдущее)
- Плавная отправка сообщений (плашка не пропадает, фото грузится с кольцом прогресса), анимации появления, «полёт» кнопки отправки.
- Истории: исправлен перескок через историю, ровное кольцо, карточка на ПК, свайп вниз закрывает.
- Дизайн списка чатов, окна чата, профиля; polish.css для сайта.
- НОВОЕ: удаление чата (у меня / у всех), крестик, «Закрыть», свайп вниз и Esc у любой шторки, свайп вниз у просмотра фото и историй.
- Исправлен баг вёрстки: не работали mx-auto/mx-4 (шторки, экран входа, «просмотры» были без центрирования).

Удалить у всех вызывает POST /api/messenger/delete-chat { chatId, forAll: true } — нужен роут на бэкенде.
Удалить у меня: локально + best-effort POST chat-settings { chatId, clearHistory: true }.

# MiliGram (мой интерфейс) — отдельная версия по адресу /vc

Папки — новые, чужие файлы не перезаписываются:
- src/components/vchat/**   — интерфейс
- src/app/vc/**             — страницы (/vc, /vc/start → редирект на /vc)
- public/vc/**              — иконки и манифест PWA (scope /vc)
- src/app/polish.css        — мягкая шлифовка дизайна всего сайта (подключается одной строкой в layout.tsx)

Использует вашу библиотеку бэкенда: lib/messenger/{client,types,uploads,premium}.ts
(mApi, uploadMedia, getDeviceId, типы MessengerAccount/Chat/Message/UserChat/Folder/Story,
 DEFAULT_PERMISSIONS, ALLOWED_REACTIONS, UPLOAD_KINDS, isPremium).

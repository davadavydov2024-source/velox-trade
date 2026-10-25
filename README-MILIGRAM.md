# MiliGram — интерфейс: патч этапа 1 (сборка) + сверка с бэкендом

Заменяет файлы в `src/components/messenger/`, `src/app/m/`, добавляет `public/miligram/`.
Из репозитория нужно УДАЛИТЬ (скрипт делает это сам):
- src/components/messenger/MessengerEntry.tsx  (скрытый вход не нужен — есть MiliGramLauncher)
- src/app/m/manifest.webmanifest/route.ts      (манифест теперь статический: public/miligram/manifest.webmanifest)
- public/m/                                    (старые иконки; новые — в public/miligram)

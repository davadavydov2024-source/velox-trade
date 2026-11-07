# MiliGram для Windows (Electron)

Обёртка вокруг `https://mili-gram.vercel.app/m`: отдельное окно, значок в трее, уведомления, автообновление.
Новые функции сайта появляются сразу — пересобирать приложение для этого не нужно.

Локально: `npm install && npm start` (нужна иконка `build/icon.png`, 512×512 — копия `public/miligram/icon-512.png`).
Сборка установщика: `npm run dist` → `dist/MiliGram-Setup.exe`. Обычно всё делает GitHub Actions (см. `.github/workflows/release.yml`).
Другой адрес для проверки: переменная окружения `MILIGRAM_URL`.

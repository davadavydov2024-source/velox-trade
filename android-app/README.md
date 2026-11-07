# MiliGram для Android (Capacitor)

Тонкая обёртка вокруг `https://mili-gram.vercel.app/m` — приложение подтягивает сайт, поэтому обновления появляются сразу.
Папка `android/` не хранится в репозитории: её создаёт `npx cap add android` в GitHub Actions при каждой сборке.

## Подпись APK (один раз)
Чтобы новые версии ставились поверх старых, APK нужно подписывать одним и тем же ключом:

    keytool -genkeypair -v -keystore miligram.jks -alias miligram -keyalg RSA -keysize 2048 -validity 10000

Затем в GitHub → Settings → Secrets and variables → Actions добавь секреты:
`ANDROID_KEYSTORE_BASE64` (содержимое `miligram.jks` в base64: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("miligram.jks"))`),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (miligram), `ANDROID_KEY_PASSWORD`.
Ключ сохрани в надёжном месте: потеряешь — придётся выпускать приложение заново. Без секретов собирается debug-APK (ставится, но не обновляется поверх прежнего).

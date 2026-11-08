# Вносит в существующие файлы мессенджера мелкие вставки (импорты и строки). Безопасно запускать повторно: что уже есть — пропускается.
# Запуск из корня проекта:  powershell -ExecutionPolicy Bypass -File scripts\apply-messenger-patches.ps1
$ErrorActionPreference = "Stop"
$utf8 = New-Object Text.UTF8Encoding $false

function Patch([string]$file, [string]$marker, [string]$find, [string]$replace, [string]$what) {
  if (-not (Test-Path $file)) { Write-Host "  ! нет файла $file ($what)" -ForegroundColor Yellow; return }
  $path = (Resolve-Path $file).Path
  $t = [IO.File]::ReadAllText($path)
  if ($t.Contains($marker)) { Write-Host "  = уже есть: $what"; return }
  if (-not $t.Contains($find)) { Write-Host "  ! не нашёл место для: $what (пришли мне этот кусок файла)" -ForegroundColor Yellow; return }
  $i = $t.IndexOf($find)
  $t = $t.Substring(0, $i) + $replace + $t.Substring($i + $find.Length)
  [IO.File]::WriteAllText($path, $t, $utf8)
  Write-Host "  + добавил: $what" -ForegroundColor Green
}

$app = "src\components\messenger\MessengerApp.tsx"
$set = "src\components\messenger\SettingsPane.tsx"
$fin = "src\app\auth\telegram-finish\page.tsx"
$nl = "`n"

Write-Host "MessengerApp.tsx"
$pushImport = 'import { isPushSupported } from "@/lib/webPush";'
Patch $app 'from "./NotificationGate"' $pushImport ($pushImport + $nl + 'import { NotificationGate } from "./NotificationGate";') "импорт NotificationGate"
Patch $app 'from "./AppLockGate"' $pushImport ($pushImport + $nl + 'import { AppLockGate } from "./AppLockGate";') "импорт AppLockGate"
Patch $app '<NotificationGate' '<MusicProvider>' ('<MusicProvider>' + $nl + '      <NotificationGate uid={me} />') "экран «Включи уведомления»"
Patch $app '<AppLockGate' '<MusicProvider>' ('<MusicProvider>' + $nl + '      <AppLockGate uid={me} />') "экран блокировки"

Write-Host "SettingsPane.tsx"
$chatInfo = 'import { ChatInfoSheet } from "./ChatInfoSheet";'
Patch $set 'from "./AppDownloads"' $chatInfo ($chatInfo + $nl + 'import { AppDownloads } from "./AppDownloads";') "импорт AppDownloads"
Patch $set 'from "./AccountSecurity"' $chatInfo ($chatInfo + $nl + 'import { AccountSecurity } from "./AccountSecurity";') "импорт AccountSecurity"
Patch $set 'from "./AppLockSettings"' $chatInfo ($chatInfo + $nl + 'import { AppLockSettings } from "./AppLockSettings";') "импорт AppLockSettings"
$install = 'label="Добавить на экран «Домой»" onClick={() => setInstallHelp(true)} />'
Patch $set '<AppDownloads' $install ($install + $nl + '          <AppDownloads />') "скачивание APK/exe"
$priv = 'label="Конфиденциальность" onClick={() => setPage("privacy")} />'
Patch $set '<AccountSecurity' $priv ($priv + $nl + '          <AccountSecurity />') "«Вход и пароль»"
Patch $set '<AppLockSettings' $priv ($priv + $nl + '          <AppLockSettings />') "«Код-пароль и Face ID»"

Write-Host "telegram-finish"
Patch $fin 'mx-return' 'router.replace("/profile");' 'router.replace((() => { try { const [p, t] = (localStorage.getItem("mx-return") || "").split("|"); localStorage.removeItem("mx-return"); return p === "/m" && Date.now() - Number(t) < 600000 ? "/m" : "/profile"; } catch { return "/profile"; } })());' "возврат в мессенджер после входа через Telegram"

Write-Host "Готово." -ForegroundColor Cyan

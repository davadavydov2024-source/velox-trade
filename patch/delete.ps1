# Запуск из корня репозитория: удаляет мёртвые файлы старой версии мессенджера
$files = "mui.tsx","ChatExtras.tsx","ChatList.tsx","NewChat.tsx","SettingsPanel.tsx"
foreach ($f in $files) { Remove-Item -Force -ErrorAction SilentlyContinue "src/components/messenger/$f" }
Write-Host "Готово. Теперь: npm run build"

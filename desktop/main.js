// MiliGram для Windows: окно с мессенджером, значок в трее, уведомления, автообновление.
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, session } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

const APP_URL = process.env.MILIGRAM_URL || "https://mili-gram.vercel.app/m";
const APP_ORIGIN = new URL(APP_URL).origin;
// окна, которые можно открыть внутри приложения (вход через Google/Firebase); всё остальное — в обычном браузере
const INTERNAL_HOSTS = [new URL(APP_URL).host, "accounts.google.com", "mili-gram.firebaseapp.com"];
const ICON = path.join(__dirname, "build", "icon.png");

let win = null;
let tray = null;
let quitting = false;

const stateFile = () => path.join(app.getPath("userData"), "window.json");
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return {}; }
}
function saveState() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch {}
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1100,
    height: st.height || 760,
    x: st.x,
    y: st.y,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: "#000000",
    title: "MiliGram",
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  win.removeMenu();
  if (st.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.loadURL(APP_URL);

  // внешние ссылки (t.me, сайты) — в браузере по умолчанию
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && INTERNAL_HOSTS.includes(u.host)) return { action: "allow" };
      if (u.protocol === "https:" || u.protocol === "http:" || u.protocol === "tg:") shell.openExternal(url);
    } catch {}
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    try {
      if (new URL(url).origin !== APP_ORIGIN && !INTERNAL_HOSTS.includes(new URL(url).host)) { e.preventDefault(); shell.openExternal(url); }
    } catch { e.preventDefault(); }
  });
  // нет сети — понятная страница вместо белого экрана
  win.webContents.on("did-fail-load", (_e, code, _d, url, isMain) => {
    if (isMain && code !== -3 && url.startsWith(APP_ORIGIN)) win.loadFile(path.join(__dirname, "offline.html"));
  });

  win.on("resize", saveState);
  win.on("move", saveState);
  // крестик сворачивает в трей, чтобы приходили уведомления; выход — из меню трея
  win.on("close", (e) => {
    saveState();
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 20, height: 20 });
  tray = new Tray(img);
  tray.setToolTip("MiliGram");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Открыть MiliGram", click: showWindow },
    { label: "Запускать вместе с Windows", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: "separator" },
    { label: "Выйти", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("click", showWindow);
}

// одно окно: второй запуск просто показывает первое
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.setAppUserModelId("com.miligram.desktop"); // иначе уведомления Windows приходят без имени приложения

  app.whenReady().then(() => {
    // разрешения: уведомления, микрофон и камера (голосовые и кружки), буфер обмена, полный экран — только для нашего сайта
    const allowed = new Set(["notifications", "media", "clipboard-sanitized-write", "fullscreen", "mediaKeySystem"]);
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm) && wc.getURL().startsWith(APP_ORIGIN)));
    session.defaultSession.setPermissionCheckHandler((wc, perm) => allowed.has(perm));

    createWindow();
    createTray();
    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  });
  app.on("before-quit", () => { quitting = true; });
  app.on("activate", showWindow);
  app.on("window-all-closed", () => { /* живём в трее */ });
}

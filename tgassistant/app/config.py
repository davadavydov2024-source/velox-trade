import os
from pathlib import Path
from datetime import timedelta, timezone


def _load_env():
    p = Path(__file__).resolve().parent.parent / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
if not BOT_TOKEN:
    raise SystemExit("Укажи BOT_TOKEN в файле .env")

ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))


def _data_dir() -> str:
    d = os.getenv("DATA_DIR")
    if d:
        return d
    if os.path.isdir("/data") and os.access("/data", os.W_OK):  # хостинги с постоянным диском в /data
        return "/data"
    return "."


DATA_DIR = _data_dir()
DB_PATH = os.getenv("DB_PATH", os.path.join(DATA_DIR, "data.db"))
TRIAL_DAYS = int(os.getenv("TRIAL_DAYS", "3"))  # пробный PREMIUM при первом подключении (0 — выключить)
PREMIUM_STARS = int(os.getenv("PREMIUM_STARS", "150"))
VIP_STARS = int(os.getenv("VIP_STARS", "350"))
SUB_DAYS = int(os.getenv("SUB_DAYS", "30"))
VERSION = "2026.10.04-15"  # меняйте при обновлениях: /version покажет, какая версия реально запущена
BUNDLE_STARS = int(os.getenv("BUNDLE_STARS", "10"))  # комбо PREMIUM+VIP
PRICES = {1: PREMIUM_STARS, 2: VIP_STARS, 3: BUNDLE_STARS}  # цены в звёздах (меняются командой /setprice)
REF_DAYS = int(os.getenv("REF_DAYS", "3"))  # бонус пригласившему за друга
SPAM_MAX = int(os.getenv("SPAM_MAX", "10000"))
SPAM_COOLDOWN = int(os.getenv("SPAM_COOLDOWN", str(20 * 60)))  # секунды
MSK = timezone(timedelta(hours=3))

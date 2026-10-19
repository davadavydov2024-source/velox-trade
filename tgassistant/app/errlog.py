import logging
import time

from . import config

log = logging.getLogger(__name__)
_last: dict = {}


async def report(bot, text: str, key: str = None):
    """Присылает админу ошибку (не чаще раза в 10 минут на одинаковую), чтобы баги не оставались незамеченными."""
    key = key or text[:100]
    now = time.time()
    if now - _last.get(key, 0) < 600:
        return
    _last[key] = now
    try:
        await bot.send_message(config.ADMIN_ID, ("⚠️ " + text)[:3500], parse_mode=None)
    except Exception as e:
        log.warning("errlog: %s", e)

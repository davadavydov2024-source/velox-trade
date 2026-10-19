import time

from ..registry import command
from .extra import _json

_CACHE: dict = {}


async def search_tracks(query: str, limit: int = 10) -> list:
    """Поиск песен в каталоге Deezer: доступны 30-секундные фрагменты и ссылка на полный трек."""
    key = " ".join(query.lower().split())[:100]
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    d = await _json("https://api.deezer.com/search", params={"q": query[:100], "limit": limit})
    out = []
    for t in d.get("data") or []:
        if not t.get("preview"):
            continue
        out.append({"id": t["id"], "title": t.get("title", ""), "artist": (t.get("artist") or {}).get("name", ""),
                    "preview": t["preview"].replace("http://", "https://"), "link": t.get("link", "")})
    if len(_CACHE) > 300:
        _CACHE.clear()
    _CACHE[key] = (time.time(), out)
    return out


@command("music", "песня", section="media", usage="[название]", help="найти песню и отправить в чат (30-секундный фрагмент + ссылка на полную)")
async def music(ctx):
    q = ctx.text_arg().strip()
    if not q:
        return await ctx.edit("Формат: <code>.music Imagine Dragons Believer</code>\nИли в любом чате: <code>@имя_бота название песни</code>")
    await ctx.edit("🎧 Ищу…")
    try:
        tracks = await search_tracks(q)
    except Exception:
        return await ctx.edit("⚠️ Сервис поиска музыки сейчас недоступен, попробуйте позже")
    if not tracks:
        return await ctx.edit("🎧 Ничего не нашёл. Попробуйте добавить исполнителя")
    t = tracks[0]
    caption = f'🎧 <a href="{t["link"]}">Слушать полностью</a>' if t["link"] else None
    await ctx.bot.send_audio(ctx.chat_id, t["preview"], title=t["title"], performer=t["artist"], duration=30, caption=caption, **ctx.bc)
    await ctx.delete_cmd()

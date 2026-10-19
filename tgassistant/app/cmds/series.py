import html
import json
from datetime import datetime, timedelta

from .. import db, config
from ..registry import command


def _today():
    return datetime.now(config.MSK).date()


def _current(st) -> int:
    if not st or not st.get("active"):
        return 0
    y = (_today() - timedelta(days=1)).isoformat()
    last = st.get("last") or ""
    if last and last < y:
        return 0
    return st.get("count", 0)


async def touch(conn_id, chat_id, is_owner, name):
    st = await db.get_cj(conn_id, chat_id, "streak")
    if not st or not st.get("active"):
        return
    t = _today().isoformat()
    if st.get("flag_day") != t:
        st.update(flag_day=t, o=False, p=False)
    st["o" if is_owner else "p"] = True
    st["name"] = name
    if st["o"] and st["p"] and st.get("last") != t:
        y = (_today() - timedelta(days=1)).isoformat()
        st["count"] = st.get("count", 0) + 1 if st.get("last") in ("", None, y) else 1
        st["last"] = t
        st["best"] = max(st.get("best", 0), st["count"])
    await db.set_cj(conn_id, chat_id, "streak", st)


@command("ogonek", section="series", help="начать серию огонька (оба пишут каждый день)")
async def ogonek(ctx):
    st = await db.get_cj(ctx.conn_id, ctx.chat_id, "streak") or {}
    if st.get("active"):
        return await ctx.edit(f"🔥 Серия уже идёт: <b>{_current(st)}</b> дн.")
    st.update(active=True, count=0, best=st.get("best", 0), last="", name=ctx.msg.chat.full_name or "")
    await db.set_cj(ctx.conn_id, ctx.chat_id, "streak", st)
    await ctx.edit("🔥 Серия начата! Пишите друг другу каждый день — огонёк растёт, когда написали оба.")


@command("stop_streak", section="series", help="остановить текущую серию")
async def stop_streak(ctx):
    st = await db.get_cj(ctx.conn_id, ctx.chat_id, "streak")
    if not st or not st.get("active"):
        return await ctx.edit("Серия не запущена")
    st["active"] = False
    await db.set_cj(ctx.conn_id, ctx.chat_id, "streak", st)
    await ctx.edit(f"🧊 Серия остановлена на <b>{_current({**st, 'active': True})}</b> дн. Рекорд: {st.get('best', 0)}")


@command("streak", section="series", help="текущая серия")
async def streak(ctx):
    st = await db.get_cj(ctx.conn_id, ctx.chat_id, "streak")
    if not st or not st.get("active"):
        return await ctx.edit("Серии нет. Запустите: <code>.ogonek</code>")
    t = _today().isoformat()
    today = "✅ сегодня уже засчитано" if st.get("last") == t else "⏳ сегодня ещё не засчитано"
    await ctx.edit(f"🔥 Серия: <b>{_current(st)}</b> дн.\n🏅 Рекорд: {st.get('best', 0)}\n{today}")


async def _all(ctx):
    rows = await db.fetchall("SELECT value FROM chatset WHERE conn_id=? AND key='streak'", (ctx.conn_id,))
    return [json.loads(r["value"]) for r in rows]


@command("streaks", section="series", help="серии в чатах")
async def streaks(ctx):
    items = [(s, _current(s)) for s in await _all(ctx) if s.get("active")]
    items.sort(key=lambda x: -x[1])
    if not items:
        return await ctx.edit("Активных серий нет")
    await ctx.edit("🔥 <b>Серии</b>\n" + "\n".join(f"• {html.escape(s.get('name') or '?')}: {c} дн." for s, c in items[:20]))


@command("streaktop", section="series", help="статистика серий (рекорды)")
async def streaktop(ctx):
    items = sorted(await _all(ctx), key=lambda s: -s.get("best", 0))
    if not items:
        return await ctx.edit("Данных пока нет")
    await ctx.edit("🏆 <b>Рекорды серий</b>\n" + "\n".join(f"{i}. {html.escape(s.get('name') or '?')} — {s.get('best', 0)} дн." for i, s in enumerate(items[:10], 1)))


@command("debug_streaks", section="series", help="техническая отладка серий")
async def debug_streaks(ctx):
    st = await db.get_cj(ctx.conn_id, ctx.chat_id, "streak")
    await ctx.edit(f"<pre>{html.escape(json.dumps(st, ensure_ascii=False, indent=1))}</pre>")

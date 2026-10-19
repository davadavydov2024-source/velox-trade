from datetime import datetime

from .. import config, db, subtools
from ..registry import command


def _uid(ctx, a):
    """Если первым аргументом длинный ID — берём его, иначе собеседника в текущем чате."""
    if a and a[0].isdigit() and len(a[0]) > 5:
        return int(a[0]), a[1:]
    return ctx.chat_id, a


async def _dm(ctx, uid, text):
    try:
        await ctx.bot.send_message(uid, text)
    except Exception:
        pass


async def _gift(ctx, uid, items):
    await db.grant_many(uid, items)
    await db.alog(ctx.owner_id, f"выдал {subtools.fmt_items(items)} → {uid} (в чате)")
    now = await subtools.describe(uid)
    await ctx.edit(f"🎁 <code>{uid}</code>: выдано {subtools.fmt_items(items)}\nСейчас: {now}")
    await _dm(ctx, uid, f"🎁 Вам выданы подписки: {subtools.fmt_items(items)}\n{now}")


def _days(a):
    return int(a[0]) if a and a[0].isdigit() and 0 < int(a[0]) <= 3650 else config.SUB_DAYS


@command("give", section="manage", hidden=True, help="(админ) подарить подписки")
async def give(ctx):
    if not ctx.is_admin:
        return
    uid, a = _uid(ctx, ctx.args.split())
    if a and a[0].lower() in subtools.FREE_WORDS:
        await db.revoke(uid)
        await db.alog(ctx.owner_id, f"снял подписки → {uid} (в чате)")
        return await ctx.edit(f"🗑 Подписки <code>{uid}</code> сняты")
    items = subtools.parse_grants(a) if a else None
    if not items:
        return await ctx.edit("Формат: <code>.give premium|vip|both [дней]</code> (в чате с человеком)\n"
                              "Две сразу с разным сроком: <code>.give premium 30 vip 60</code>\nили с ID: <code>.give 123456789 both 30</code>")
    await _gift(ctx, uid, items)


@command("premium", section="manage", hidden=True, help="(админ) выдать PREMIUM собеседнику")
async def premium(ctx):
    if not ctx.is_admin:
        return
    uid, a = _uid(ctx, ctx.args.split())
    await _gift(ctx, uid, [(1, _days(a))])


@command("vip", section="manage", hidden=True, help="(админ) выдать VIP собеседнику")
async def vip(ctx):
    if not ctx.is_admin:
        return
    uid, a = _uid(ctx, ctx.args.split())
    await _gift(ctx, uid, [(2, _days(a))])


@command("both", "combo", section="manage", hidden=True, help="(админ) выдать обе подписки сразу: PREMIUM и VIP")
async def both(ctx):
    if not ctx.is_admin:
        return
    uid, a = _uid(ctx, ctx.args.split())
    d = _days(a)
    await _gift(ctx, uid, [(1, d), (2, d)])


@command("revoke", section="manage", hidden=True, help="(админ) снять подписки")
async def revoke(ctx):
    if not ctx.is_admin:
        return
    uid, a = _uid(ctx, ctx.args.split())
    tier = subtools.revoke_tier(a[0] if a else "")
    if tier is False:
        return await ctx.edit("Формат: <code>.revoke [premium|vip]</code> — без тарифа снимает всё")
    await db.revoke(uid, tier)
    await db.alog(ctx.owner_id, f"снял {subtools.NAME.get(tier, 'все подписки')} → {uid} (в чате)")
    await ctx.edit(f"🗑 <code>{uid}</code>: снято {subtools.NAME.get(tier, 'всё')}. Осталось: {await subtools.describe(uid)}")


@command("addmod", section="manage", hidden=True, help="(админ) назначить мини-админа")
async def addmod(ctx):
    if not ctx.is_admin:
        return
    uid, _ = _uid(ctx, ctx.args.split())
    await db.add_mod(uid)
    await db.alog(ctx.owner_id, f"назначил мини-админа → {uid} (в чате)")
    await ctx.edit(f"🛡 <code>{uid}</code> — мини-админ: без лимитов, VIP-функции, но без выдачи подписок")
    await _dm(ctx, uid, "🛡 Вам выданы права мини-админа: все функции без лимитов. Выдавать подписки нельзя.")


@command("delmod", section="manage", hidden=True, help="(админ) снять мини-админа")
async def delmod(ctx):
    if not ctx.is_admin:
        return
    uid, _ = _uid(ctx, ctx.args.split())
    await db.del_mod(uid)
    await db.alog(ctx.owner_id, f"снял мини-админа → {uid} (в чате)")
    await ctx.edit(f"✅ <code>{uid}</code> больше не мини-админ")


@command("mods", section="manage", hidden=True, help="(админ) список мини-админов")
async def mods(ctx):
    if not ctx.is_admin:
        return
    await ctx.edit("🛡 <b>Мини-админы</b>\n" + ("\n".join(f"<code>{u}</code>" for u in sorted(db.MODS)) or "пока нет"))


@command("subs", section="manage", hidden=True, help="(админ/мини-админ) список подписок")
async def subs(ctx):
    if not ctx.is_staff:
        return
    rows = await db.subs_overview()
    if not rows:
        return await ctx.edit("Активных подписок нет")
    await ctx.edit("<b>Подписки</b>\n" + "\n".join(
        f"<code>{uid}</code> — " + " · ".join(f"{subtools.NAME[t]} до {datetime.fromtimestamp(u, config.MSK):%d.%m}" for t, u in sorted(tiers.items()))
        for uid, tiers in rows[:40]))

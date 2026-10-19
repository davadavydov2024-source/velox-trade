from datetime import datetime

from . import config, db

NAME = {1: "PREMIUM", 2: "VIP", 3: "КОМБО PREMIUM+VIP"}
WORDS = {"premium": [1], "prem": [1], "vip": [2], "combo": [1, 2], "both": [1, 2], "all": [1, 2], "bundle": [1, 2], "оба": [1, 2], "комбо": [1, 2]}
FREE_WORDS = ("free", "0", "none")


def parse_grants(tokens):
    """['premium','30','vip','60'] -> [(1,30),(2,60)]; ['both','30'] -> [(1,30),(2,30)].
    Число после слова — дни; без числа берётся стандартный срок. None — если не разобрали."""
    out, i = [], 0
    while i < len(tokens):
        word = WORDS.get(tokens[i].lower())
        if not word:
            return None
        days = config.SUB_DAYS
        if i + 1 < len(tokens) and tokens[i + 1].isdigit():
            days = int(tokens[i + 1])
            i += 1
        if not 0 < days <= 3650:
            return None
        out += [(t, days) for t in word]
        i += 1
    return out or None


def fmt_items(items) -> str:
    return " + ".join(f"{NAME[t]} {d} дн." for t, d in items)


async def describe(uid: int) -> str:
    act = await db.active_subs(uid)
    return " · ".join(f"{NAME[t]} до {datetime.fromtimestamp(u, config.MSK):%d.%m.%Y}" for t, u in sorted(act.items())) or "нет активных подписок"


def revoke_tier(token: str):
    """'premium' -> 1, 'vip' -> 2, 'all'/пусто -> None (снять всё); False если слово не распознано."""
    t = (token or "all").lower()
    if t in ("premium", "prem"):
        return 1
    if t == "vip":
        return 2
    return None if t in ("all", "both", "combo", "free", "0") else False

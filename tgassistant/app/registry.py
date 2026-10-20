import html
from dataclasses import dataclass
from typing import Callable

TIERS = {0: "FREE", 1: "PREMIUM", 2: "VIP"}

SECTIONS = {
    "info": ("ℹ️", "Основные"),
    "utils": ("🧰", "Утилиты"),
    "text": ("🔤", "Текст и шифры"),
    "calc": ("🧮", "Числа, даты, мир"),
    "fun": ("🎲", "Развлечения"),
    "social": ("💬", "Общение и предсказания"),
    "games": ("🎮", "Игры"),
    "anim": ("✨", "Анимации"),
    "media": ("🎞", "Медиа"),
    "series": ("🔥", "Серии"),
    "mod": ("🛡", "Модерация"),
    "profile": ("👤", "Профиль и авто"),
    "manage": ("⚙️", "Управление"),
}


@dataclass
class Cmd:
    names: tuple
    fn: Callable
    tier: int
    section: str
    usage: str
    help: str
    hidden: bool = False


OVERRIDE = {n: "text" for n in (
    "upper lower count fancy vapor zalgo clap repeat mock reverse b64 unb64 morse unmorse hash spoiler mono bq rot13 caesar tobin frombin lorem fix "
    "leet upside nato").split()}
OVERRIDE.update({n: "calc" for n in "calc pct convert roman prime base days age zodiac wt uuid moon timer sort split tip avg gcd fibo factorial".split()})
OVERRIDE.update({n: "social" for n in (
    "hug pat highfive compliment advice wish riddle horo nick emoji shrug tableflip lenny kao ship truth dare fate гадать luck fortune bored wyr").split()})

REG: dict[str, Cmd] = {}
CMDS: list[Cmd] = []


def command(*names, tier=0, section="info", usage="", help="", hidden=False):
    def deco(fn):
        c = Cmd(names, fn, tier, OVERRIDE.get(names[0], section), usage, help, hidden)
        CMDS.append(c)
        for n in names:
            REG[n.lower()] = c
        return fn
    return deco


def section_cmds(sec):
    return [c for c in CMDS if c.section == sec and not c.hidden]


def section_text(sec: str, tier=None) -> str:
    """Текст раздела. Если передан тариф пользователя, замок 🔒 ставится только на команды, которые ему недоступны."""
    icon, title = SECTIONS[sec]
    cmds = section_cmds(sec)
    lines = [f"{icon} <b>{title}</b>", ""]
    for c in cmds:
        usage = f" {html.escape(c.usage)}" if c.usage else ""
        alias = "".join(f" / <code>.{n}</code>" for n in c.names[1:])
        lock = " 🔒" if tier is not None and c.tier > tier else ""
        lines.append(f"<code>.{c.names[0]}{usage}</code>{alias}{lock} — {html.escape(c.help)}")
    top = max((c.tier for c in cmds), default=0)
    if tier is None:
        if top:
            lines += ["", f"🔒 Нужен тариф {TIERS[top]}"]
    else:
        locked = [c for c in cmds if c.tier > tier]
        if locked:
            lines += ["", f"🔒 Закрыто на вашем тарифе ({TIERS[tier]}): {len(locked)} из {len(cmds)}. Нужен {TIERS[max(c.tier for c in locked)]} — /tariffs"]
        elif top:
            lines += ["", "✅ Все команды раздела вам доступны"]
    return "\n".join(lines)

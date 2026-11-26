/**
 * Векторные картинки NFT-подарков MiliGram.
 * Каждый экземпляр рисуется по признакам (модель, фон, узор) — картинку хранить не нужно.
 * Модуль без React: возвращает SVG-разметку строкой, поэтому им можно пользоваться и на сервере,
 * и в компоненте <NftArt/> (через dangerouslySetInnerHTML — внутри только наши статические строки и числа).
 */
import type { GiftNft } from "./gifts";
import { backdropOf, modelOf, symbolOf } from "./nft";

export type NftTier = "legendary" | "epic" | "common";

/** Редкость экземпляра: по самому редкому признаку (шанс в промилле). */
export function nftTier(nft: Pick<GiftNft, "model" | "backdrop" | "symbol">): NftTier {
  const r = Math.min(modelOf(nft.model).rarity, backdropOf(nft.backdrop).rarity, symbolOf(nft.symbol).rarity);
  return r <= 20 ? "legendary" : r <= 50 ? "epic" : "common";
}

export const NFT_TIER_LABEL: Record<NftTier, string> = { legendary: "Легендарный", epic: "Эпический", common: "Обычный" };

const f = (n: number) => Math.round(n * 100) / 100;

function starPath(points: number, ro: number, ri: number, rot = -90): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    const r = i % 2 === 0 ? ro : ri;
    out.push(`${f(Math.cos(a) * r)},${f(Math.sin(a) * r)}`);
  }
  return `M${out.join("L")}Z`;
}

const circ = (cx: number, cy: number, r: number) => `M${f(cx - r)},${cy}a${r},${r} 0 1,0 ${f(2 * r)},0a${r},${r} 0 1,0 ${f(-2 * r)},0Z`;
/** n лучей-палочек через центр (угол поворота шаг 180/n), толщина w, длина len. */
function spokes(n: number, w: number, len: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI) / n, c = Math.cos(a), s = Math.sin(a), hw = w / 2;
    const pt = (x: number, y: number) => `${f(x * c - y * s)},${f(x * s + y * c)}`;
    out.push(`M${pt(-len, -hw)}L${pt(len, -hw)}L${pt(len, hw)}L${pt(-len, hw)}Z`);
  }
  return out.join("");
}

/** Иконки узора: рисуются вокруг (0,0), размер ≈ 20. */
const SYMBOL_PATHS: Record<string, string> = {
  "Звёзды": starPath(5, 10, 4.2),
  "Сердца": "M0,9 C-13,0 -10,-9 -4.5,-9 C-1.8,-9 0,-7 0,-5.2 C0,-7 1.8,-9 4.5,-9 C10,-9 13,0 0,9Z",
  "Молнии": "M3,-10 L-6,2 L-1,2 L-3,10 L6,-3 L1,-3Z",
  "Луны": "M3,-10 A10,10 0 1 0 9,4 A8,8 0 1 1 3,-10Z",
  "Искры": starPath(4, 11, 2.8),
  "Кристаллы": "M0,-10 L7.5,0 L0,10 L-7.5,0Z",
  "Короны": "M-9,6 L-10,-5 L-4.5,0 L0,-8 L4.5,0 L10,-5 L9,6Z",
  "Снежинки": spokes(3, 2.2, 10.5) + circ(0, 0, 3),
  "Цветы": circ(0, -5.6, 4.6) + circ(5.3, -1.7, 4.6) + circ(3.3, 4.5, 4.6) + circ(-3.3, 4.5, 4.6) + circ(-5.3, -1.7, 4.6),
  "Лучи": spokes(4, 2.4, 11.5) + circ(0, 0, 5),
  "Ноты": "M-7,7a4.2,3.2 0 1,0 8.4,0a4.2,3.2 0 1,0 -8.4,0ZM0.6,6L3.2,6L3.2,-8L10,-6L10,-10L0.6,-12Z",
  "Клеверы": circ(-4.6, 0, 4.6) + circ(4.6, 0, 4.6) + circ(0, -4.6, 4.6) + circ(0, 4.6, 4.6) + "M-1.2,4L1.2,4L2.4,11L-2.4,11Z",
  "Пики": "M0,-10C13,2 9,9 2.4,6C3,9 4,10 5.5,11L-5.5,11C-4,10 -3,9 -2.4,6C-9,9 -13,2 0,-10Z",
  "Инь-ян": "M0,-10A10,10 0 0 1 0,10A5,5 0 0 1 0,0A5,5 0 0 0 0,-10Z" + circ(0, -5, 1.6),
  "Пламя": "M0,-11C3,-5 9,-3 9,3C9,8 5,11 0,11C-5,11 -9,8 -9,3C-9,-1 -6,-3 -4,-6C-3,-3 -2,-2 -1,-2C-2,-6 -1,-9 0,-11Z",
  "Капли": "M0,-11C6,-3 8,1 8,4A8,8 0 0 1 -8,4C-8,1 -6,-3 0,-11Z",
  "Планеты": circ(0, 0, 6) + "M-12,1C-6,-3 8,-7 12,-2C6,2 -8,5 -12,1Z",
  "Бабочки": "M0,0C-4,-10 -12,-9 -10,-2C-9,3 -4,3 0,0ZM0,0C4,-10 12,-9 10,-2C9,3 4,3 0,0ZM0,1C-3,4 -9,10 -6,10C-3,10 -1,6 0,1ZM0,1C3,4 9,10 6,10C3,10 1,6 0,1Z",
  "Кометы": circ(5, -5, 4.6) + "M2,-8L-11,10L8,-2Z",
  "Ключи": circ(-5, -5, 5) + "M-2,-2L10,10L8,12L-4,0Z",
  "Глаза": "M-11,0C-5,-8 5,-8 11,0C5,8 -5,8 -11,0Z" + circ(0, 0, 4),
};

/** Контур иконки узора (рисуется вокруг (0,0), viewBox -12 -12 24 24) — для плиток «Узоры» в каталоге. */
export const nftSymbolPath = (name: string): string => SYMBOL_PATHS[name] ?? SYMBOL_PATHS["Звёзды"];

/** Где стоят иконки узора: x, y, поворот, масштаб. Центр оставлен свободным под фигурку. */
const PATTERN: [number, number, number, number][] = [
  [24, 26, -14, 1.15], [70, 14, 10, 0.7], [132, 15, -8, 0.75], [177, 28, 14, 1.15],
  [13, 76, 8, 0.8], [188, 74, -10, 0.85], [15, 126, -12, 0.95], [187, 128, 12, 0.9],
  [32, 168, 10, 0.8], [168, 170, -10, 0.85], [48, 52, 0, 0.5], [154, 50, 0, 0.5],
];

interface FigureDef { s: number; dx?: number; dy: number; rot?: number; body: (p: string) => string }

/* ───────────── фигурки (рисуются вокруг (0,0)) ───────────── */

const rocket = (p: string) => `
  <defs>
    <linearGradient id="${p}rb" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#dfe7f2"/><stop offset="1" stop-color="#9fb0c8"/></linearGradient>
    <linearGradient id="${p}rn" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#c4172f"/></linearGradient>
    <linearGradient id="${p}rf" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ff5d5d"/><stop offset="1" stop-color="#b3122a"/></linearGradient>
    <linearGradient id="${p}fl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".45" stop-color="#ffb02e"/><stop offset="1" stop-color="#ff4d1a" stop-opacity=".1"/></linearGradient>
    <radialGradient id="${p}rw" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#bff0ff"/><stop offset=".55" stop-color="#3fa3ec"/><stop offset="1" stop-color="#0f4c9c"/></radialGradient>
    <clipPath id="${p}rc"><path d="M0,-62 C23,-40 27,-6 21,40 L-21,40 C-27,-6 -23,-40 0,-62Z"/></clipPath>
  </defs>
  <path d="M-13,40 C-20,58 -6,72 0,86 C6,72 20,58 13,40Z" fill="url(#${p}fl)"/>
  <path d="M-7,42 C-10,54 -2,62 0,70 C2,62 10,54 7,42Z" fill="#fffbe0" opacity=".9"/>
  <path d="M-17,8 C-31,20 -38,34 -37,50 L-14,36Z" fill="url(#${p}rf)"/>
  <path d="M17,8 C31,20 38,34 37,50 L14,36Z" fill="url(#${p}rf)"/>
  <path d="M-10,38 L10,38 L8,50 L-8,50Z" fill="#59657a"/>
  <path d="M0,-62 C23,-40 27,-6 21,40 L-21,40 C-27,-6 -23,-40 0,-62Z" fill="url(#${p}rb)"/>
  <g clip-path="url(#${p}rc)">
    <path d="M-30,-60 L30,-60 L30,-28 C16,-34 -16,-34 -30,-28Z" fill="url(#${p}rn)"/>
    <rect x="-30" y="20" width="60" height="7" fill="#d62a40"/>
    <path d="M-17,-52 C-24,-30 -24,0 -19,30" stroke="#fff" stroke-opacity=".7" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
  <circle cx="0" cy="-6" r="13" fill="#7f93ad"/><circle cx="0" cy="-6" r="10.5" fill="url(#${p}rw)"/>
  <ellipse cx="-3.5" cy="-10" rx="3.6" ry="2.4" fill="#fff" opacity=".85" transform="rotate(-30 -3.5 -10)"/>`;

const crown = (p: string) => `
  <defs>
    <linearGradient id="${p}cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff2a6"/><stop offset=".45" stop-color="#f7bd2e"/><stop offset="1" stop-color="#b9791a"/></linearGradient>
    <linearGradient id="${p}cb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffd95e"/><stop offset="1" stop-color="#9e6412"/></linearGradient>
    <radialGradient id="${p}jr" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff9aa8"/><stop offset=".6" stop-color="#e0173a"/><stop offset="1" stop-color="#7d0620"/></radialGradient>
    <radialGradient id="${p}jb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#a8e0ff"/><stop offset=".6" stop-color="#2a7be0"/><stop offset="1" stop-color="#0c2f86"/></radialGradient>
    <radialGradient id="${p}je" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#b8ffc4"/><stop offset=".6" stop-color="#1fb855"/><stop offset="1" stop-color="#0a5a28"/></radialGradient>
  </defs>
  <path d="M-52,24 L-60,-32 L-29,-4 L0,-46 L29,-4 L60,-32 L52,24Z" fill="url(#${p}cg)" stroke="#a8690f" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M-44,20 L-50,-18 L-27,4 L-8,-28" stroke="#fff" stroke-opacity=".55" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="-54" y="22" width="108" height="21" rx="6" fill="url(#${p}cb)" stroke="#a8690f" stroke-width="1.5"/>
  <rect x="-50" y="25" width="100" height="3" rx="1.5" fill="#fff" opacity=".4"/>
  <circle cx="-60" cy="-35" r="6.5" fill="url(#${p}cg)" stroke="#a8690f"/><circle cx="0" cy="-50" r="7" fill="url(#${p}cg)" stroke="#a8690f"/><circle cx="60" cy="-35" r="6.5" fill="url(#${p}cg)" stroke="#a8690f"/>
  <path d="M0,-12 L11,2 L0,16 L-11,2Z" fill="url(#${p}jr)" stroke="#fff3" stroke-width="1"/><path d="M-4,-2 L0,-7 L2,-2Z" fill="#fff" opacity=".7"/>
  <circle cx="-33" cy="33" r="6.2" fill="url(#${p}je)" stroke="#fff4"/><circle cx="0" cy="33" r="6.2" fill="url(#${p}jb)" stroke="#fff4"/><circle cx="33" cy="33" r="6.2" fill="url(#${p}jr)" stroke="#fff4"/>
  <circle cx="-35" cy="31" r="1.7" fill="#fff" opacity=".8"/><circle cx="-2" cy="31" r="1.7" fill="#fff" opacity=".8"/><circle cx="31" cy="31" r="1.7" fill="#fff" opacity=".8"/>`;

const dragon = (p: string) => `
  <defs>
    <radialGradient id="${p}dh" cx=".5" cy=".3" r=".85"><stop offset="0" stop-color="#7cf08a"/><stop offset=".6" stop-color="#26a850"/><stop offset="1" stop-color="#136a3a"/></radialGradient>
    <radialGradient id="${p}ds" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#c4fba6"/><stop offset="1" stop-color="#5cc86c"/></radialGradient>
    <linearGradient id="${p}dhn" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset="1" stop-color="#d9962a"/></linearGradient>
    <radialGradient id="${p}de" cx=".4" cy=".4" r=".8"><stop offset="0" stop-color="#fff9a8"/><stop offset="1" stop-color="#ff9418"/></radialGradient>
  </defs>
  <g id="${p}dside">
    <path d="M-28,-34 C-44,-52 -50,-68 -42,-80 C-34,-68 -22,-54 -14,-44Z" fill="url(#${p}dhn)" stroke="#9a6414" stroke-width="1.2"/>
    <path d="M-48,-4 C-68,-14 -76,0 -72,14 C-64,8 -56,10 -49,18Z" fill="#17803f"/>
    <path d="M-48,8 C-62,6 -68,12 -66,20 C-60,18 -54,19 -49,23Z" fill="#126b34"/>
  </g>
  <use href="#${p}dside" transform="scale(-1 1)"/>
  <path d="M-9,-44 L0,-62 L9,-44Z M-24,-42 L-18,-56 L-9,-44Z M24,-42 L18,-56 L9,-44Z" fill="#169446"/>
  <path d="M0,-47 C33,-47 53,-27 51,2 C49,27 31,45 0,45 C-31,45 -49,27 -51,2 C-53,-27 -33,-47 0,-47Z" fill="url(#${p}dh)" stroke="#0e5a30" stroke-width="1.6"/>
  <ellipse cx="0" cy="22" rx="31" ry="22" fill="url(#${p}ds)" stroke="#2f9a50" stroke-width="1.2"/>
  <ellipse cx="-10.5" cy="14" rx="3.6" ry="5.4" fill="#145b32" transform="rotate(20 -10.5 14)"/><ellipse cx="10.5" cy="14" rx="3.6" ry="5.4" fill="#145b32" transform="rotate(-20 10.5 14)"/>
  <path d="M-21,31 Q0,43 21,31" stroke="#145b32" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M-15,34 L-11.5,41 L-8,36Z M15,34 L11.5,41 L8,36Z" fill="#fff"/>
  <g id="${p}deye">
    <path d="M-36,-9 Q-22,-26 -7,-12 Q-20,-1 -36,-9Z" fill="url(#${p}de)" stroke="#6a3a08" stroke-width="1.4"/>
    <ellipse cx="-21" cy="-12" rx="2.7" ry="7" fill="#1b1209" transform="rotate(8 -21 -12)"/>
    <circle cx="-24" cy="-16" r="1.9" fill="#fff"/>
    <path d="M-41,-22 L-6,-28" stroke="#0e5a30" stroke-width="5.5" stroke-linecap="round"/>
  </g>
  <use href="#${p}deye" transform="scale(-1 1)"/>
  <circle cx="-36" cy="14" r="3" fill="#bff7a0" opacity=".45"/><circle cx="36" cy="14" r="3" fill="#bff7a0" opacity=".45"/><circle cx="-30" cy="4" r="2" fill="#bff7a0" opacity=".4"/><circle cx="30" cy="4" r="2" fill="#bff7a0" opacity=".4"/>`;

const bear = (p: string) => `
  <defs>
    <radialGradient id="${p}bh" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#d89a58"/><stop offset=".65" stop-color="#9c6130"/><stop offset="1" stop-color="#6a3d1a"/></radialGradient>
    <radialGradient id="${p}bm" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#fbe6c4"/><stop offset="1" stop-color="#d9ac74"/></radialGradient>
    <linearGradient id="${p}bc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".5" stop-color="#f7bd2e"/><stop offset="1" stop-color="#b9791a"/></linearGradient>
    <linearGradient id="${p}bb" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ff5d6f"/><stop offset="1" stop-color="#b3122a"/></linearGradient>
  </defs>
  <circle cx="-40" cy="-30" r="19" fill="url(#${p}bh)" stroke="#5a3214" stroke-width="1.4"/><circle cx="40" cy="-30" r="19" fill="url(#${p}bh)" stroke="#5a3214" stroke-width="1.4"/>
  <circle cx="-40" cy="-30" r="10.5" fill="#e8b98a"/><circle cx="40" cy="-30" r="10.5" fill="#e8b98a"/>
  <path d="M-22,34 L-34,44 L-30,60 L-6,48Z M22,34 L34,44 L30,60 L6,48Z" fill="url(#${p}bb)" stroke="#7a0c1e" stroke-width="1.2" stroke-linejoin="round"/>
  <ellipse cx="0" cy="2" rx="53" ry="47" fill="url(#${p}bh)" stroke="#5a3214" stroke-width="1.6"/>
  <ellipse cx="0" cy="20" rx="25" ry="20" fill="url(#${p}bm)" stroke="#b98a52" stroke-width="1"/>
  <ellipse cx="0" cy="9" rx="9.5" ry="7" fill="#3a2010"/><ellipse cx="-3" cy="6.6" rx="3" ry="1.9" fill="#fff" opacity=".55"/>
  <path d="M0,15 L0,23 M0,23 Q-8,31 -15,25 M0,23 Q8,31 15,25" stroke="#3a2010" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <circle cx="-21" cy="-8" r="5.8" fill="#24120a"/><circle cx="21" cy="-8" r="5.8" fill="#24120a"/><circle cx="-19.2" cy="-10" r="2" fill="#fff"/><circle cx="22.8" cy="-10" r="2" fill="#fff"/>
  <circle cx="-36" cy="14" r="7" fill="#ff8aa0" opacity=".4"/><circle cx="36" cy="14" r="7" fill="#ff8aa0" opacity=".4"/>
  <path d="M-8,52 L-26,42 L-26,64Z M8,52 L26,42 L26,64Z" fill="url(#${p}bb)" stroke="#7a0c1e" stroke-width="1.2" stroke-linejoin="round"/>
  <circle cx="0" cy="52" r="6" fill="url(#${p}bc)" stroke="#a8690f"/>
  <g transform="translate(2 -50) rotate(-9)">
    <path d="M-23,0 L-26,-20 L-13,-11 L0,-28 L13,-11 L26,-20 L23,0Z" fill="url(#${p}bc)" stroke="#a8690f" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="-24" y="-3" width="48" height="9" rx="3" fill="url(#${p}bc)" stroke="#a8690f" stroke-width="1.2"/>
    <circle cx="-26" cy="-21" r="3.2" fill="#fff0a0" stroke="#a8690f" stroke-width=".8"/><circle cx="0" cy="-29" r="3.4" fill="#fff0a0" stroke="#a8690f" stroke-width=".8"/><circle cx="26" cy="-21" r="3.2" fill="#fff0a0" stroke="#a8690f" stroke-width=".8"/>
    <circle cx="0" cy="1.5" r="2.8" fill="#e0173a"/><circle cx="-14" cy="1.5" r="2.2" fill="#2a7be0"/><circle cx="14" cy="1.5" r="2.2" fill="#1fb855"/>
  </g>`;

const heart = (p: string) => `
  <defs>
    <radialGradient id="${p}hg" cx=".33" cy=".28" r=".85"><stop offset="0" stop-color="#ff9cc2"/><stop offset=".45" stop-color="#ee2a6a"/><stop offset="1" stop-color="#8a0a36"/></radialGradient>
    <linearGradient id="${p}hr" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff2a6"/><stop offset=".5" stop-color="#f7bd2e"/><stop offset="1" stop-color="#b9791a"/></linearGradient>
  </defs>
  <path d="M0,54 C-74,8 -52,-54 -23,-52 C-8,-51 0,-40 0,-31 C0,-40 8,-51 23,-52 C52,-54 74,8 0,54Z" fill="url(#${p}hg)" stroke="#6c0627" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M-47,-16 C-50,-34 -38,-43 -26,-40" stroke="#fff" stroke-opacity=".5" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="-30" cy="-30" rx="9" ry="5" fill="#fff" opacity=".6" transform="rotate(-35 -30 -30)"/>
  <path d="M-21,4 C-21,-9 -5,-9 0,4 C5,17 21,17 21,4 C21,-9 5,-9 0,4 C-5,17 -21,17 -21,4Z" stroke="#fff" stroke-opacity=".92" stroke-width="4.5" fill="none" stroke-linejoin="round"/>
  <ellipse cx="0" cy="-64" rx="27" ry="8" stroke="url(#${p}hr)" stroke-width="4.5" fill="none"/>
  <ellipse cx="-14" cy="-66" rx="8" ry="1.6" fill="#fff" opacity=".7"/>`;

const diamond = (p: string) => `
  <defs>
    <linearGradient id="${p}d1" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f4feff"/><stop offset="1" stop-color="#a6ecff"/></linearGradient>
    <linearGradient id="${p}d2" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#9be8ff"/><stop offset="1" stop-color="#3fb4f0"/></linearGradient>
    <linearGradient id="${p}d3" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#5cc6f5"/><stop offset="1" stop-color="#1f78c4"/></linearGradient>
    <linearGradient id="${p}d4" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4cb8f2"/><stop offset="1" stop-color="#14529e"/></linearGradient>
    <linearGradient id="${p}d5" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#e6fdff"/><stop offset="1" stop-color="#7fdcff"/></linearGradient>
  </defs>
  <g stroke="#ffffff" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round">
    <path d="M-28,-44 L28,-44 L14,-8 L-14,-8Z" fill="url(#${p}d1)"/>
    <path d="M-28,-44 L-14,-8 L-36,-8Z" fill="url(#${p}d2)"/><path d="M-28,-44 L-36,-8 L-60,-8Z" fill="url(#${p}d3)"/>
    <path d="M28,-44 L36,-8 L14,-8Z" fill="url(#${p}d5)"/><path d="M28,-44 L60,-8 L36,-8Z" fill="url(#${p}d2)"/>
    <path d="M-60,-8 L-36,-8 L0,58Z" fill="url(#${p}d4)"/><path d="M-36,-8 L-14,-8 L0,58Z" fill="url(#${p}d3)"/>
    <path d="M-14,-8 L14,-8 L0,58Z" fill="url(#${p}d2)"/>
    <path d="M14,-8 L36,-8 L0,58Z" fill="url(#${p}d3)"/><path d="M36,-8 L60,-8 L0,58Z" fill="url(#${p}d4)"/>
  </g>
  <path d="M-22,-40 L-8,-40 L-12,-24Z" fill="#fff" opacity=".55"/>
  <path d="M0,-70 L2.4,-62 L10,-60 L2.4,-58 L0,-50 L-2.4,-58 L-10,-60 L-2.4,-62Z" fill="#fff"/>
  <path d="M-58,28 L-55.5,34 L-49,36 L-55.5,38 L-58,44 L-60.5,38 L-67,36 L-60.5,34Z" fill="#fff" opacity=".85"/>
  <path d="M54,24 L56,29 L61,30.5 L56,32 L54,37 L52,32 L47,30.5 L52,29Z" fill="#fff" opacity=".85"/>`;

const clover = (p: string) => `
  <defs>
    <radialGradient id="${p}lg" cx=".4" cy=".75" r="1"><stop offset="0" stop-color="#9af582"/><stop offset=".55" stop-color="#30b44c"/><stop offset="1" stop-color="#147836"/></radialGradient>
    <radialGradient id="${p}lc" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fff2a6"/><stop offset=".6" stop-color="#f7bd2e"/><stop offset="1" stop-color="#a8690f"/></radialGradient>
  </defs>
  <path d="M0,0 C0,24 4,46 24,66" stroke="#0f6a2c" stroke-width="7.5" fill="none" stroke-linecap="round"/>
  <path d="M0,0 C0,24 4,46 24,66" stroke="#39b655" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <g id="${p}leaf">
    <path d="M0,0 C-31,-6 -36,-45 -15,-52 C-6,-54 0,-45 0,-37 C0,-45 6,-54 15,-52 C36,-45 31,-6 0,0Z" fill="url(#${p}lg)" stroke="#0f6a2c" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M0,-5 L0,-34" stroke="#d6ffc8" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>
    <path d="M-13,-44 C-20,-38 -22,-27 -18,-19" stroke="#fff" stroke-opacity=".4" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  </g>
  <use href="#${p}leaf" transform="rotate(45) scale(.86 .96)"/><use href="#${p}leaf" transform="rotate(135) scale(.86 .96)"/><use href="#${p}leaf" transform="rotate(225) scale(.86 .96)"/><use href="#${p}leaf" transform="rotate(315) scale(.86 .96)"/>
  <circle cx="0" cy="0" r="7" fill="url(#${p}lc)" stroke="#a8690f" stroke-width="1.4"/><circle cx="-2" cy="-2.2" r="2" fill="#fff" opacity=".8"/>`;

/* ───────────── новые фигурки ───────────── */

const starFig = (p: string) => `
  <defs>
    <linearGradient id="${p}sg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff6b0"/><stop offset=".5" stop-color="#ffc933"/><stop offset="1" stop-color="#e07b10"/></linearGradient>
    <linearGradient id="${p}sh" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset="1" stop-color="#ffd95a"/></linearGradient>
  </defs>
  <path d="${starPath(5, 62, 28)}" fill="url(#${p}sg)" stroke="#b9650c" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M0,-62 L-9,-14 L-60,-19 L-23,10 L-37,50 L0,26Z" fill="url(#${p}sh)" opacity=".55"/>
  <path d="${starPath(5, 40, 18)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="-10" cy="-2" r="3.6" fill="#7a3e08"/><circle cx="10" cy="-2" r="3.6" fill="#7a3e08"/>
  <circle cx="-9" cy="-3.2" r="1.1" fill="#fff"/><circle cx="11" cy="-3.2" r="1.1" fill="#fff"/>
  <path d="M-6,8 Q0,14 6,8" stroke="#7a3e08" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <ellipse cx="-19" cy="7" rx="4.5" ry="2.8" fill="#ff7a59" opacity=".55"/><ellipse cx="19" cy="7" rx="4.5" ry="2.8" fill="#ff7a59" opacity=".55"/>`;

const ghost = (p: string) => `
  <defs>
    <linearGradient id="${p}gb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#e3dcff"/><stop offset="1" stop-color="#b9a9f0"/></linearGradient>
  </defs>
  <path d="M-44,52 L-44,-6 C-44,-62 44,-62 44,-6 L44,52 L29,39 L14.5,52 L0,39 L-14.5,52 L-29,39Z" fill="url(#${p}gb)" stroke="#8d7bd6" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M-34,-8 C-34,-40 -18,-50 -6,-50" stroke="#fff" stroke-opacity=".85" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="-15" cy="-6" rx="7" ry="10" fill="#2b2250"/><ellipse cx="15" cy="-6" rx="7" ry="10" fill="#2b2250"/>
  <ellipse cx="-13" cy="-10" rx="2.4" ry="3.4" fill="#fff"/><ellipse cx="17" cy="-10" rx="2.4" ry="3.4" fill="#fff"/>
  <ellipse cx="0" cy="16" rx="6" ry="8" fill="#2b2250"/><ellipse cx="0" cy="19" rx="3.4" ry="3.6" fill="#ff7aa8"/>
  <ellipse cx="-27" cy="10" rx="6" ry="3.6" fill="#ff9ec4" opacity=".6"/><ellipse cx="27" cy="10" rx="6" ry="3.6" fill="#ff9ec4" opacity=".6"/>`;

const cat = (p: string) => `
  <defs>
    <radialGradient id="${p}cf" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#d9c8ff"/><stop offset=".6" stop-color="#9a7fe0"/><stop offset="1" stop-color="#5a3fa8"/></radialGradient>
    <radialGradient id="${p}ce" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff6a0"/><stop offset="1" stop-color="#f5a623"/></radialGradient>
    <linearGradient id="${p}cg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#cfeaff" stop-opacity=".5"/><stop offset="1" stop-color="#6aa8ff" stop-opacity=".12"/></linearGradient>
  </defs>
  <path d="M-34,-30 L-44,-62 L-14,-44Z" fill="#7d62cc" stroke="#4a3290" stroke-width="2" stroke-linejoin="round"/>
  <path d="M34,-30 L44,-62 L14,-44Z" fill="#7d62cc" stroke="#4a3290" stroke-width="2" stroke-linejoin="round"/>
  <path d="M-33,-38 L-38,-54 L-22,-44Z" fill="#ffb3d1"/><path d="M33,-38 L38,-54 L22,-44Z" fill="#ffb3d1"/>
  <ellipse cx="0" cy="2" rx="46" ry="40" fill="url(#${p}cf)" stroke="#4a3290" stroke-width="2.4"/>
  <ellipse cx="-17" cy="-4" rx="11" ry="12.5" fill="url(#${p}ce)" stroke="#8a5a0a" stroke-width="1.4"/><ellipse cx="17" cy="-4" rx="11" ry="12.5" fill="url(#${p}ce)" stroke="#8a5a0a" stroke-width="1.4"/>
  <ellipse cx="-17" cy="-4" rx="3.4" ry="9.5" fill="#1d1236"/><ellipse cx="17" cy="-4" rx="3.4" ry="9.5" fill="#1d1236"/>
  <circle cx="-20" cy="-9" r="2.6" fill="#fff"/><circle cx="14" cy="-9" r="2.6" fill="#fff"/>
  <path d="M-5,14 L5,14 L0,20Z" fill="#ff8fb8"/><path d="M0,20 Q-6,27 -12,23 M0,20 Q6,27 12,23" stroke="#2b1b55" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M-30,16 L-52,12 M-30,22 L-52,26 M30,16 L52,12 M30,22 L52,26" stroke="#e9dcff" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="0" cy="2" r="58" fill="url(#${p}cg)" stroke="#d9ecff" stroke-opacity=".85" stroke-width="3.5"/>
  <path d="M-42,-30 C-34,-46 -22,-54 -8,-57" stroke="#fff" stroke-opacity=".85" stroke-width="5" fill="none" stroke-linecap="round"/>`;

const ufo = (p: string) => `
  <defs>
    <linearGradient id="${p}ub" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e6edf7"/><stop offset=".5" stop-color="#9eb0c9"/><stop offset="1" stop-color="#55657e"/></linearGradient>
    <radialGradient id="${p}ud" cx=".4" cy=".25" r=".9"><stop offset="0" stop-color="#e6fffb"/><stop offset=".6" stop-color="#5de8d0" stop-opacity=".85"/><stop offset="1" stop-color="#1a8f93" stop-opacity=".9"/></radialGradient>
    <linearGradient id="${p}ubm" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b6ffe9" stop-opacity=".75"/><stop offset="1" stop-color="#b6ffe9" stop-opacity="0"/></linearGradient>
  </defs>
  <path d="M-20,22 L-52,78 L52,78 L20,22Z" fill="url(#${p}ubm)"/>
  <path d="M-22,-8 C-22,-40 22,-40 22,-8Z" fill="url(#${p}ud)" stroke="#d6fff7" stroke-opacity=".8" stroke-width="1.8"/>
  <ellipse cx="-8" cy="-22" rx="6" ry="3.4" fill="#fff" opacity=".7" transform="rotate(-25 -8 -22)"/>
  <ellipse cx="0" cy="8" rx="62" ry="20" fill="url(#${p}ub)" stroke="#3d4a60" stroke-width="2.2"/>
  <ellipse cx="0" cy="0" rx="40" ry="8" fill="#fff" opacity=".28"/>
  <circle cx="-38" cy="10" r="4.4" fill="#ffd95a"/><circle cx="-14" cy="17" r="4.4" fill="#ff6b9c"/><circle cx="14" cy="17" r="4.4" fill="#5de8d0"/><circle cx="38" cy="10" r="4.4" fill="#ffd95a"/>`;

const potion = (p: string) => `
  <defs>
    <linearGradient id="${p}pl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c58bff"/><stop offset=".55" stop-color="#7a3df0"/><stop offset="1" stop-color="#3b1a9e"/></linearGradient>
    <radialGradient id="${p}pg" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#cfe6ff" stop-opacity=".12"/></radialGradient>
    <clipPath id="${p}pc"><path d="M-12,-52 L12,-52 L12,-28 C46,-14 52,46 22,56 L-22,56 C-52,46 -46,-14 -12,-28Z"/></clipPath>
  </defs>
  <rect x="-13" y="-66" width="26" height="14" rx="4" fill="#b9791a" stroke="#6b430a" stroke-width="1.8"/>
  <path d="M-12,-52 L12,-52 L12,-28 C46,-14 52,46 22,56 L-22,56 C-52,46 -46,-14 -12,-28Z" fill="url(#${p}pg)" stroke="#e6f2ff" stroke-width="2.6" stroke-linejoin="round"/>
  <g clip-path="url(#${p}pc)"><path d="M-60,0 C-30,-8 -14,8 0,0 C14,-8 30,8 60,0 L60,70 L-60,70Z" fill="url(#${p}pl)"/></g>
  <circle cx="-14" cy="26" r="5" fill="#fff" opacity=".6"/><circle cx="10" cy="38" r="3.4" fill="#fff" opacity=".55"/><circle cx="16" cy="18" r="2.4" fill="#fff" opacity=".6"/>
  <path d="M-34,-4 C-40,14 -36,30 -28,40" stroke="#fff" stroke-opacity=".7" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M0,-86 L2.4,-78 L10,-76 L2.4,-74 L0,-66 L-2.4,-74 L-10,-76 L-2.4,-78Z" fill="#fff"/>`;

const moon = (p: string) => `
  <defs>
    <linearGradient id="${p}mg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset=".55" stop-color="#ffe9a0"/><stop offset="1" stop-color="#e8b94a"/></linearGradient>
  </defs>
  <path d="M14,-60 A60,60 0 1 0 44,40 A48,48 0 1 1 14,-60Z" fill="url(#${p}mg)" stroke="#c9972a" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="-26" cy="-4" r="6" fill="#e8c46a" opacity=".6"/><circle cx="-14" cy="26" r="4" fill="#e8c46a" opacity=".6"/><circle cx="-34" cy="24" r="3" fill="#e8c46a" opacity=".55"/>
  <path d="M-38,-30 C-30,-46 -14,-54 0,-56" stroke="#fff" stroke-opacity=".8" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="${starPath(4, 12, 3)}" transform="translate(38 -26)" fill="#fff"/><path d="${starPath(4, 8, 2)}" transform="translate(54 4)" fill="#fff" opacity=".85"/><path d="${starPath(4, 6, 1.6)}" transform="translate(30 18)" fill="#fff" opacity=".7"/>`;

const flame = (p: string) => `
  <defs>
    <linearGradient id="${p}fo" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff8a1f"/><stop offset=".6" stop-color="#f23a1a"/><stop offset="1" stop-color="#a30f1f"/></linearGradient>
    <linearGradient id="${p}fm" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffd24a"/><stop offset="1" stop-color="#ff7a1a"/></linearGradient>
    <linearGradient id="${p}fi" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fffbd0"/><stop offset="1" stop-color="#ffe066"/></linearGradient>
  </defs>
  <path d="M4,-70 C10,-44 44,-34 44,6 C44,38 24,56 0,56 C-26,56 -46,38 -46,10 C-46,-12 -32,-24 -22,-38 C-18,-26 -10,-20 -4,-22 C-10,-44 -4,-58 4,-70Z" fill="url(#${p}fo)" stroke="#8a1010" stroke-width="2" stroke-linejoin="round"/>
  <path d="M2,-30 C8,-14 30,-8 30,16 C30,36 16,46 0,46 C-18,46 -30,34 -30,18 C-30,6 -22,-2 -14,-12 C-12,-4 -6,0 -2,-2 C-6,-14 -2,-22 2,-30Z" fill="url(#${p}fm)"/>
  <path d="M0,2 C5,12 16,16 16,28 C16,38 9,44 0,44 C-10,44 -16,38 -16,30 C-16,22 -10,18 -6,12 C-4,16 -1,18 1,16 C-1,10 -1,6 0,2Z" fill="url(#${p}fi)"/>
  <path d="M-36,-2 C-40,10 -38,22 -32,30" stroke="#fff" stroke-opacity=".5" stroke-width="4" fill="none" stroke-linecap="round"/>`;

const FIGURES: Record<string, FigureDef> = {
  rocket: { s: 0.86, dx: 2, dy: 88, rot: 35, body: rocket },
  crown: { s: 1.0, dy: 92, body: crown },
  dragon: { s: 0.95, dy: 96, body: dragon },
  "nft-bear": { s: 0.88, dy: 92, body: bear },
  "nft-heart": { s: 0.98, dy: 98, body: heart },
  "nft-diamond": { s: 1.04, dy: 88, body: diamond },
  "nft-clover": { s: 0.98, dy: 84, body: clover },
  "nft-star": { s: 0.98, dy: 94, body: starFig },
  "nft-ghost": { s: 1.0, dy: 90, body: ghost },
  "nft-cat": { s: 0.98, dy: 90, body: cat },
  "nft-ufo": { s: 1.0, dy: 78, body: ufo },
  "nft-potion": { s: 0.9, dy: 92, body: potion },
  "nft-moon": { s: 0.98, dy: 90, body: moon },
  "nft-flame": { s: 0.96, dy: 88, body: flame },
};

/** Есть ли для подарка нарисованная фигурка (иначе компонент рисует эмодзи). */
export const hasNftFigure = (giftId: string) => giftId in FIGURES;

/* ───────────── сборка карточки ───────────── */

export interface NftArtOptions {
  uid: string; // уникальный префикс id внутри страницы
  giftId: string;
  emoji: string; // запасной вариант
  label: string; // «#123» или «NFT»
  nft: Pick<GiftNft, "model" | "backdrop" | "symbol">;
  motion?: boolean; // false — без анимаций (по умолчанию включены)
}

function rays(cx: number, cy: number, n: number): string {
  const out: string[] = [];
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i += 2) {
    const a0 = i * step, a1 = (i + 1) * step, R = 190;
    out.push(`M${cx},${cy}L${f(cx + Math.cos(a0) * R)},${f(cy + Math.sin(a0) * R)}L${f(cx + Math.cos(a1) * R)},${f(cy + Math.sin(a1) * R)}Z`);
  }
  return out.join("");
}

/** Короткая запись SMIL-анимации. */
const anim = (attr: string, values: string, dur: string, extra = "") =>
  `<animate attributeName="${attr}" values="${values}" dur="${dur}" repeatCount="indefinite"${extra}/>`;
const animT = (type: string, values: string, dur: string, extra = "") =>
  `<animateTransform attributeName="transform" type="${type}" values="${values}" dur="${dur}" repeatCount="indefinite"${extra}/>`;
const EASE = ' calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"';

/** Внутренняя разметка SVG (viewBox 0 0 200 200). motion=false — статичная картинка без анимаций. */
export function nftArtMarkup({ uid, giftId, emoji, label, nft, motion = true }: NftArtOptions): string {
  const p = `n${uid}-`;
  const b = backdropOf(nft.backdrop);
  const m = modelOf(nft.model);
  const symName = symbolOf(nft.symbol).name;
  const sym = SYMBOL_PATHS[symName] ?? SYMBOL_PATHS["Звёзды"];
  const tier = nftTier(nft);
  const fig = FIGURES[giftId];
  const sx = (fig?.s ?? 1) * (m.flip ? -1 : 1);
  const kind = m.anim;
  const on = motion;

  const rawFigure = fig
    ? `<g transform="translate(${100 + (fig.dx ?? 0)} ${fig.dy}) scale(${sx} ${fig.s})" filter="url(#${p}tint)"><g${fig.rot ? ` transform="rotate(${fig.rot})"` : ""}>${fig.body(p)}</g></g>`
    : `<text x="100" y="126" font-size="88" text-anchor="middle" filter="url(#${p}tint)">${emoji}</text>`;

  // Фигурка: всегда лёгкое «парение»; у моделей — свой эффект (пульс, глитч).
  let figure = rawFigure;
  if (on) {
    if (kind === "pulse") figure = `<g transform="translate(100 92)"><g>${animT("scale", "1;1.08;1", "1.8s", EASE)}<g transform="translate(-100 -92)">${rawFigure}</g></g></g>`;
    else if (kind === "glitch") figure = `<g>${animT("translate", "0 0;0 0;-3 0;4 -1;0 0;2 1;0 0;0 0", "2.6s", ' keyTimes="0;.55;.6;.65;.7;.76;.82;1"')}${rawFigure}</g>`;
    figure = `<g>${animT("translate", "0 0;0 -5;0 0", kind === "spin" ? "2.6s" : "3.6s", EASE)}${figure}</g>`;
  }

  const patternRaw = PATTERN.map(([x, y, r, k]) => `<path d="${sym}"${symName === "Глаза" ? ' fill-rule="evenodd"' : ""} transform="translate(${x} ${y}) rotate(${r}) scale(${k})"/>`).join("");
  const pattern = on ? `<g fill="#fff" opacity=".17">${animT("translate", "0 0;0 3;0 0", "5s", EASE)}${patternRaw}</g>` : `<g fill="#fff" opacity=".17">${patternRaw}</g>`;

  const twinkle = (d: string, t: string, begin: string, dur: string) =>
    `<path d="${d}" transform="${t}">${on ? anim("opacity", "1;.15;1", dur, ` begin="${begin}"`) : ""}</path>`;
  const sparkles = tier === "common" ? "" : `
    <g fill="#fff" opacity=".9">
      ${twinkle(starPath(4, 8, 1.8), "translate(150 54)", "0s", "2.2s")}${twinkle(starPath(4, 5.5, 1.3), "translate(48 118)", "-.7s", "1.8s")}
      ${twinkle(starPath(4, 6.5, 1.5), "translate(160 132)", "-1.3s", "2.6s")}${tier === "legendary" ? twinkle(starPath(4, 9, 2), "translate(42 56)", "-.4s", "2s") : ""}
    </g>`;

  const sweepOn = tier !== "common" || kind === "shimmer" || kind === "holo";
  const sweepOp = kind === "shimmer" ? 0.65 : tier === "legendary" ? 0.5 : 0.3;
  const sweepOpacity = tier === "common" && kind !== "shimmer" && kind !== "holo" ? 0 : sweepOp;
  const sheen = !sweepOn ? "" : `
    <rect width="200" height="200" fill="url(#${p}holo)" opacity="${tier === "legendary" ? 0.26 : kind === "holo" ? 0.3 : 0.16}" style="mix-blend-mode:screen">${on && kind === "holo" ? anim("opacity", ".12;.42;.12", "3s", EASE) : ""}</rect>
    <path d="M-20,150 L120,-10 L150,-10 L-20,180Z" fill="url(#${p}shine)" opacity="${sweepOpacity}">${on ? animT("translate", "-150 0;260 0;260 0", kind === "shimmer" ? "2.6s" : "5s", ' keyTimes="0;.45;1"') : ""}</path>`;

  // Эффекты моделей
  let extra = "";
  if (on && kind === "flame") {
    const embers = [[60, 0], [92, -.9], [124, -1.7], [150, -.4], [80, -1.3]].map(([x, d], i) =>
      `<circle cx="${x}" cy="160" r="${2 + (i % 3)}" fill="#ffb347">${anim("cy", "160;70", `${2.4 + (i % 3) * 0.5}s`, ` begin="${d}s"`)}${anim("opacity", "0;1;0", `${2.4 + (i % 3) * 0.5}s`, ` begin="${d}s"`)}</circle>`).join("");
    extra = `<ellipse cx="100" cy="176" rx="96" ry="64" fill="url(#${p}fire)" style="mix-blend-mode:screen">${anim("opacity", ".15;.45;.2;.5;.15", "1.6s")}</ellipse>${embers}`;
  } else if (on && kind === "aurora") {
    extra = `<g style="mix-blend-mode:screen"><ellipse cx="60" cy="50" rx="90" ry="26" fill="#3ee6a8" opacity=".28" transform="rotate(-14 60 50)">${animT("translate", "-30 0;30 14;-30 0", "6s", EASE)}</ellipse><ellipse cx="150" cy="80" rx="80" ry="22" fill="#a56bff" opacity=".26" transform="rotate(12 150 80)">${animT("translate", "30 0;-30 -10;30 0", "7s", EASE)}</ellipse></g>`;
  } else if (on && kind === "glitch") {
    extra = `<g opacity=".14" fill="none" stroke="#fff" stroke-width="1">${animT("translate", "0 0;0 8", ".7s")}${Array.from({ length: 26 }, (_, i) => `<path d="M0,${i * 8}H200"/>`).join("")}</g>
      <rect x="0" y="0" width="200" height="10" fill="#fff" opacity="0" style="mix-blend-mode:overlay">${anim("opacity", "0;0;.55;0;0", "2.6s")}${anim("y", "30;30;120;160;160", "2.6s")}</rect>`;
  } else if (on && kind === "spin") {
    extra = `<g transform="translate(100 92)"><ellipse rx="74" ry="26" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.5" transform="rotate(-20)"/>
      <g>${animT("rotate", "0;360", "3.4s")}<g transform="rotate(-20)"><circle cx="74" cy="0" r="4.5" fill="#fff"/><circle cx="74" cy="0" r="9" fill="#fff" opacity=".25"/></g></g></g>`;
  }
  if (on && kind === "pulse") extra += `<circle cx="100" cy="92" r="40" fill="none" stroke="#fff" stroke-width="2" opacity="0">${anim("r", "40;92", "1.8s")}${anim("opacity", ".55;0", "1.8s")}</circle>`;

  const raysSpeed = kind === "spin" ? "14s" : "70s";
  const raysEl = `<path d="${rays(100, 92, 24)}" fill="#fff" opacity=".07"/>`;
  const raysG = on ? `<g>${animT("rotate", "0 100 92;360 100 92", raysSpeed)}${raysEl}</g>` : raysEl;

  const frame = tier === "legendary"
    ? `<rect x="3" y="3" width="194" height="194" rx="34" fill="none" stroke="url(#${p}gold)" stroke-width="4"/>`
    : tier === "epic"
      ? `<rect x="2.5" y="2.5" width="195" height="195" rx="34" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="2.5"/>`
      : `<rect x="1" y="1" width="198" height="198" rx="36" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>`;

  const tintA = on && kind === "rainbow" ? anim("values", `${m.hue};${m.hue + 360}`, "6s") : "";
  const holoGrad = on && kind === "holo" ? `<animateTransform attributeName="gradientTransform" type="rotate" from="0 .5 .5" to="360 .5 .5" dur="5s" repeatCount="indefinite"/>` : "";
  const goldGrad = on && tier === "legendary" ? `<animateTransform attributeName="gradientTransform" type="rotate" from="0 .5 .5" to="360 .5 .5" dur="4s" repeatCount="indefinite"/>` : "";
  const glowAnim = on ? `${anim("r", "78;86;78", "3.2s", EASE)}${anim("opacity", "1;.75;1", "3.2s", EASE)}` : "";
  const shadowAnim = on ? anim("rx", kind === "spin" ? "46;38;46" : "46;38;46", kind === "spin" ? "2.6s" : "3.6s", EASE) : "";

  return `
  <defs>
    <radialGradient id="${p}bg" cx="50%" cy="38%" r="78%"><stop offset="0" stop-color="${b.colors[0]}"/><stop offset="1" stop-color="${b.colors[1]}"/></radialGradient>
    <radialGradient id="${p}gl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".6" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}vg" cx="50%" cy="45%" r="70%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <radialGradient id="${p}fire" cx="50%" cy="100%" r="80%"><stop offset="0" stop-color="#ff7a1a"/><stop offset=".5" stop-color="#ff3d1a" stop-opacity=".6"/><stop offset="1" stop-color="#ff3d1a" stop-opacity="0"/></radialGradient>
    <linearGradient id="${p}holo" x1="0" x2="1" y1="0" y2="1">${holoGrad}<stop offset="0" stop-color="#ff6ad5"/><stop offset=".33" stop-color="#ffd36a"/><stop offset=".66" stop-color="#6affd9"/><stop offset="1" stop-color="#6aa8ff"/></linearGradient>
    <linearGradient id="${p}shine" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${p}gold" x1="0" x2="1" y1="0" y2="1">${goldGrad}<stop offset="0" stop-color="#fff2a6"/><stop offset=".5" stop-color="#f2b324"/><stop offset="1" stop-color="#fff2a6"/></linearGradient>
    <filter id="${p}tint" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
      <feColorMatrix type="hueRotate" values="${m.hue}">${tintA}</feColorMatrix><feColorMatrix type="saturate" values="${m.sat}"/>${m.bright && m.bright !== 1 ? `<feComponentTransfer><feFuncR type="linear" slope="${m.bright}"/><feFuncG type="linear" slope="${m.bright}"/><feFuncB type="linear" slope="${m.bright}"/></feComponentTransfer>` : ""}
    </filter>
    <clipPath id="${p}clip"><rect width="200" height="200" rx="36"/></clipPath>
  </defs>
  <g clip-path="url(#${p}clip)">
    <rect width="200" height="200" fill="url(#${p}bg)"/>
    ${raysG}
    ${pattern}
    <circle cx="100" cy="92" r="78" fill="url(#${p}gl)">${glowAnim}</circle>
    <circle cx="100" cy="92" r="62" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.5"/>
    <ellipse cx="100" cy="152" rx="46" ry="7" fill="#000" opacity=".32">${shadowAnim}</ellipse>
    ${figure}
    <rect width="200" height="200" fill="url(#${p}vg)"/>
    ${extra}${sparkles}${sheen}
    <rect x="60" y="164" width="80" height="24" rx="12" fill="#000" opacity=".4"/>
    <text x="100" y="181" font-size="13.5" font-weight="700" fill="#fff" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${label}</text>
  </g>
  ${frame}`;
}

/** Готовый самостоятельный .svg-файл (например, чтобы выгрузить картинку NFT). */
export function nftSvgFile(opts: NftArtOptions, size = 512): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}">${nftArtMarkup(opts)}</svg>`;
}

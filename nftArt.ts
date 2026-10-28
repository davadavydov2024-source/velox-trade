/**
 * Векторные картинки NFT-подарков MiliGram.
 * Каждый экземпляр рисуется по признакам (модель, фон, узор) — картинку хранить не нужно.
 * Модуль без React: возвращает SVG-разметку строкой, поэтому им можно пользоваться и на сервере,
 * и в компоненте <NftArt/> (через dangerouslySetInnerHTML — внутри только наши статические строки и числа).
 */
import type { GiftNft } from "./gifts";
import { backdropOf, modelOf, symbolOf, nftTier, type NftTier } from "./nft";

export { nftTier };
export type { NftTier };

export const NFT_TIER_LABEL: Record<NftTier, string> = { mythic: "Мифический", legendary: "Легендарный", epic: "Эпический", common: "Обычный" };

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

/** Иконки узора: рисуются вокруг (0,0), размер ≈ 20. */
const SYMBOL_PATHS: Record<string, string> = {
  "Звёзды": starPath(5, 10, 4.2),
  "Сердца": "M0,9 C-13,0 -10,-9 -4.5,-9 C-1.8,-9 0,-7 0,-5.2 C0,-7 1.8,-9 4.5,-9 C10,-9 13,0 0,9Z",
  "Молнии": "M3,-10 L-6,2 L-1,2 L-3,10 L6,-3 L1,-3Z",
  "Луны": "M3,-10 A10,10 0 1 0 9,4 A8,8 0 1 1 3,-10Z",
  "Искры": starPath(4, 11, 2.8),
  "Кристаллы": "M0,-10 L7.5,0 L0,10 L-7.5,0Z",
  "Короны": "M-9,6 L-10,-5 L-4.5,0 L0,-8 L4.5,0 L10,-5 L9,6Z",
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

const FIGURES: Record<string, FigureDef> = {
  rocket: { s: 0.86, dx: 2, dy: 88, rot: 35, body: rocket },
  crown: { s: 1.0, dy: 92, body: crown },
  dragon: { s: 0.95, dy: 96, body: dragon },
  "nft-bear": { s: 0.88, dy: 92, body: bear },
  "nft-heart": { s: 0.98, dy: 98, body: heart },
  "nft-diamond": { s: 1.04, dy: 88, body: diamond },
  "nft-clover": { s: 0.98, dy: 84, body: clover },
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

/** Внутренняя разметка SVG (viewBox 0 0 200 200). */
export function nftArtMarkup({ uid, giftId, emoji, label, nft }: NftArtOptions): string {
  const p = `n${uid}-`;
  const b = backdropOf(nft.backdrop);
  const m = modelOf(nft.model);
  const sym = SYMBOL_PATHS[symbolOf(nft.symbol).name] ?? SYMBOL_PATHS["Звёзды"];
  const tier = nftTier(nft);
  const fig = FIGURES[giftId];
  const sx = (fig?.s ?? 1) * (m.flip ? -1 : 1);

  const figure = fig
    ? `<g transform="translate(${100 + (fig.dx ?? 0)} ${fig.dy}) scale(${sx} ${fig.s})" filter="url(#${p}tint)"><g${fig.rot ? ` transform="rotate(${fig.rot})"` : ""}>${fig.body(p)}</g></g>`
    : `<text x="100" y="126" font-size="88" text-anchor="middle" filter="url(#${p}tint)">${emoji}</text>`;

  const pattern = PATTERN.map(([x, y, r, k]) => `<path d="${sym}" transform="translate(${x} ${y}) rotate(${r}) scale(${k})"/>`).join("");

  const sparkles = tier === "common" ? "" : `
    <g fill="#fff" opacity=".9">
      <path d="${starPath(4, 8, 1.8)}" transform="translate(150 54)"/><path d="${starPath(4, 5.5, 1.3)}" transform="translate(48 118)"/>
      <path d="${starPath(4, 6.5, 1.5)}" transform="translate(160 132)"/>${(tier === "legendary" || tier === "mythic") ? `<path d="${starPath(4, 9, 2)}" transform="translate(42 56)"/>` : ""}
    </g>`;

  const sheen = tier === "common" ? "" : `
    <rect width="200" height="200" fill="url(#${p}holo)" opacity="${(tier === "legendary" || tier === "mythic") ? 0.26 : 0.16}" style="mix-blend-mode:screen"/>
    <path d="M-20,150 L120,-10 L150,-10 L-20,180Z" fill="url(#${p}shine)" opacity="${(tier === "legendary" || tier === "mythic") ? 0.5 : 0.3}"/>`;

  const frame = (tier === "legendary" || tier === "mythic")
    ? `<rect x="3" y="3" width="194" height="194" rx="34" fill="none" stroke="url(#${p}gold)" stroke-width="4"/>`
    : tier === "epic"
      ? `<rect x="2.5" y="2.5" width="195" height="195" rx="34" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="2.5"/>`
      : `<rect x="1" y="1" width="198" height="198" rx="36" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>`;

  return `
  <defs>
    <radialGradient id="${p}bg" cx="50%" cy="38%" r="78%"><stop offset="0" stop-color="${b.colors[0]}"/><stop offset="1" stop-color="${b.colors[1]}"/></radialGradient>
    <radialGradient id="${p}gl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".6" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}vg" cx="50%" cy="45%" r="70%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <linearGradient id="${p}holo" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff6ad5"/><stop offset=".33" stop-color="#ffd36a"/><stop offset=".66" stop-color="#6affd9"/><stop offset="1" stop-color="#6aa8ff"/></linearGradient>
    <linearGradient id="${p}shine" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${p}gold" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff2a6"/><stop offset=".5" stop-color="#f2b324"/><stop offset="1" stop-color="#fff2a6"/></linearGradient>
    <filter id="${p}tint" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
      <feColorMatrix type="hueRotate" values="${m.hue}"/><feColorMatrix type="saturate" values="${m.sat}"/>
    </filter>
    <clipPath id="${p}clip"><rect width="200" height="200" rx="36"/></clipPath>
  </defs>
  <g clip-path="url(#${p}clip)">
    <rect width="200" height="200" fill="url(#${p}bg)"/>
    <path d="${rays(100, 92, 24)}" fill="#fff" opacity=".07"/>
    <g fill="#fff" opacity=".17">${pattern}</g>
    <circle cx="100" cy="92" r="78" fill="url(#${p}gl)"/>
    <circle cx="100" cy="92" r="62" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.5"/>
    <ellipse cx="100" cy="152" rx="46" ry="7" fill="#000" opacity=".32"/>
    ${figure}
    <rect width="200" height="200" fill="url(#${p}vg)"/>
    ${sparkles}${sheen}
    <rect x="60" y="164" width="80" height="24" rx="12" fill="#000" opacity=".4"/>
    <text x="100" y="181" font-size="13.5" font-weight="700" fill="#fff" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${label}</text>
  </g>
  ${frame}`;
}

/** Готовый самостоятельный .svg-файл (например, чтобы выгрузить картинку NFT). */
export function nftSvgFile(opts: NftArtOptions, size = 512): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}">${nftArtMarkup(opts)}</svg>`;
}

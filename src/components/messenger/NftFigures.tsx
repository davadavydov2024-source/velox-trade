import type { ReactNode } from "react";

/**
 * Векторные фигурки NFT-подарков (вместо эмодзи). Все нарисованы в квадрате 100×100 и подставляются в NftArt.
 * Цвета намеренно «базовые»: оттенок модели (hue-rotate / saturate) красит их поверх, как и раньше.
 */

const eyes = (y: number, dx = 11, r = 4) => (
  <>
    <circle cx={50 - dx} cy={y} r={r} fill="#1b1b24" /><circle cx={50 + dx} cy={y} r={r} fill="#1b1b24" />
    <circle cx={50 - dx + r * 0.35} cy={y - r * 0.35} r={r * 0.35} fill="#fff" /><circle cx={50 + dx + r * 0.35} cy={y - r * 0.35} r={r * 0.35} fill="#fff" />
  </>
);

export const NFT_FIGURES: Record<string, ReactNode> = {
  rocket: (
    <>
      <path d="M50 4C69 20 71 50 63 74H37C29 50 31 20 50 4Z" fill="#eef2f8" />
      <path d="M50 4C61 13 66 23 67 33H33C34 23 39 13 50 4Z" fill="#e5484d" />
      <path d="M50 4C69 20 71 50 63 74H56C62 50 60 22 50 4Z" fill="#000" opacity=".1" />
      <circle cx="50" cy="48" r="10" fill="#2b6cb0" stroke="#9fb3c8" strokeWidth="3.5" /><circle cx="46.5" cy="44.5" r="3" fill="#fff" opacity=".6" />
      <path d="M37 58 20 82l17-7zM63 58l17 24-17-7z" fill="#e5484d" />
      <path d="M41 74h18L50 98z" fill="#ff9f1c" /><path d="M45 74h10L50 90z" fill="#fff3a0" />
    </>
  ),
  crown: (
    <>
      <path d="M12 74 8 28l24 20 18-28 18 28 24-20-4 46z" fill="#f6c026" />
      <path d="M12 74 8 28l24 20 4 26z" fill="#fff" opacity=".18" />
      <rect x="12" y="74" width="76" height="13" rx="3" fill="#d9981a" />
      <circle cx="8" cy="26" r="5" fill="#ffe27a" /><circle cx="50" cy="18" r="5.5" fill="#ffe27a" /><circle cx="92" cy="26" r="5" fill="#ffe27a" />
      <circle cx="30" cy="80.5" r="3.5" fill="#e5484d" /><circle cx="50" cy="80.5" r="4" fill="#3b82f6" /><circle cx="70" cy="80.5" r="3.5" fill="#22c55e" />
    </>
  ),
  dragon: (
    <>
      <path d="M26 36 10 6l30 16zM74 36 90 6 60 22z" fill="#f2e4b8" />
      <path d="M40 22 50 6l10 16z" fill="#2b8a45" />
      <ellipse cx="50" cy="54" rx="33" ry="31" fill="#3fae5a" />
      <ellipse cx="50" cy="70" rx="21" ry="16" fill="#8be09a" />
      <circle cx="43" cy="69" r="2.6" fill="#1d5a2c" /><circle cx="57" cy="69" r="2.6" fill="#1d5a2c" />
      <path d="M26 46q9-11 19 1-9 6-19-1zM74 46q-9-11-19 1 9 6 19-1z" fill="#ffd23f" />
      <rect x="34" y="40" width="4.5" height="10" rx="2" fill="#1b1b24" /><rect x="61.5" y="40" width="4.5" height="10" rx="2" fill="#1b1b24" />
      <path d="M42 80l3 8 3-8zM52 80l3 8 3-8z" fill="#fff" />
    </>
  ),
  "nft-bear": (
    <>
      <circle cx="22" cy="40" r="13" fill="#8a5a33" /><circle cx="78" cy="40" r="13" fill="#8a5a33" />
      <circle cx="22" cy="40" r="6.5" fill="#d9a066" /><circle cx="78" cy="40" r="6.5" fill="#d9a066" />
      <circle cx="50" cy="58" r="32" fill="#a86f3f" />
      <ellipse cx="50" cy="70" rx="15" ry="11.5" fill="#e8c392" />
      <ellipse cx="50" cy="65" rx="5.5" ry="4" fill="#3a2414" />
      {eyes(55, 13, 3.8)}
      <path d="M43 75q7 6 14 0" fill="none" stroke="#3a2414" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M30 32 26 14l12 8 12-14 12 14 12-8-4 18z" fill="#f6c026" /><circle cx="50" cy="10" r="3.4" fill="#e5484d" />
    </>
  ),
  "nft-heart": (
    <>
      <path d="M50 92C8 60 4 30 27 19c13-6 21 1 23 10 2-9 10-16 23-10 23 11 19 41-23 73z" fill="#e8355a" />
      <path d="M50 92C8 60 4 30 27 19c8-4 14-2 18 2-8 0-20 6-20 22 0 14 9 26 25 49z" fill="#fff" opacity=".13" />
      <path d="M20 34q3-10 13-11" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" opacity=".6" />
      <path d="M36 52c5-8 12-1 14 0s9-8 14 0c4 7-7 12-14 0-7 12-18 7-14 0z" fill="none" stroke="#ffd1dc" strokeWidth="3" strokeLinejoin="round" />
    </>
  ),
  "nft-diamond": (
    <>
      <path d="M50 4 86 36 50 96 14 36z" fill="#3bc9e8" />
      <path d="M50 4 86 36H14z" fill="#9ae8f8" />
      <path d="M14 36h72L50 96z" fill="#1fa3c9" />
      <path d="M32 36 50 96 41 36zM68 36 50 96 59 36z" fill="#fff" opacity=".22" /><path d="M32 36 50 4 41 36z" fill="#fff" opacity=".4" />
    </>
  ),
  "nft-clover": (
    <>
      <path d="M50 54C54 78 60 90 76 96" fill="none" stroke="#2d8a3f" strokeWidth="5" strokeLinecap="round" />
      {[0, 90, 180, 270].map((r) => (
        <g key={r} transform={`rotate(${r} 50 46)`}>
          <path d="M50 46C34 38 32 18 40 12c6-4 10 0 10 6 0-6 4-10 10-6 8 6 6 26-10 34z" fill="#3fbf5a" />
          <path d="M50 46 50 22" stroke="#1f7a33" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="50" cy="46" r="4.5" fill="#2d8a3f" />
    </>
  ),
  "nft-unicorn": (
    <>
      <path d="M50 2 43 30h14z" fill="#ffd23f" /><path d="M46 20h8M44.5 26h11" stroke="#d9981a" strokeWidth="2" />
      <path d="M26 34 22 12l15 14zM74 34 78 12 63 26z" fill="#f4eefa" />
      <path d="M20 40c-10 18-6 40 6 52-2-16 2-26 8-34zM80 40c10 18 6 40-6 52 2-16-2-26-8-34z" fill="#c77dff" />
      <path d="M14 56c-4 14 0 26 8 34 0-12 3-20 7-26zM86 56c4 14 0 26-8 34 0-12-3-20-7-26z" fill="#ff6ec7" opacity=".85" />
      <ellipse cx="50" cy="60" rx="25" ry="28" fill="#f8f4ff" />
      <ellipse cx="50" cy="74" rx="15" ry="11" fill="#ffd9ec" />
      <circle cx="45" cy="75" r="1.8" fill="#c06090" /><circle cx="55" cy="75" r="1.8" fill="#c06090" />
      <path d="M33 54q5-5 10 0M57 54q5-5 10 0" fill="none" stroke="#3a2a5a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="33" cy="66" r="4" fill="#ff9ec7" opacity=".6" /><circle cx="67" cy="66" r="4" fill="#ff9ec7" opacity=".6" />
    </>
  ),
  "nft-phoenix": (
    <>
      <path d="M50 90C30 84 10 66 4 28c14 10 24 12 34 12zM50 90C70 84 90 66 96 28 82 38 72 40 62 40z" fill="#ff7a1a" />
      <path d="M50 90C36 84 22 70 14 46c10 8 18 10 26 10zM50 90C64 84 78 70 86 46 76 54 68 56 60 56z" fill="#ffb02e" />
      <path d="M50 98c-14-8-18-26-12-42 4 4 8 4 12-4 4 8 8 8 12 4 6 16 2 34-12 42z" fill="#ff4b1f" />
      <path d="M50 94c-8-6-10-18-6-28 2 3 4 3 6-2 2 5 4 5 6 2 4 10 2 22-6 28z" fill="#ffd23f" />
      <circle cx="50" cy="32" r="14" fill="#ff6a1a" />
      <path d="M50 4 44 22h12zM38 12l4 12M62 12l-4 12" fill="#ffb02e" stroke="#ffb02e" strokeWidth="2" strokeLinejoin="round" />
      <path d="M44 34h12l-6 10z" fill="#ffd23f" />
      <circle cx="44" cy="29" r="2.6" fill="#1b1b24" /><circle cx="56" cy="29" r="2.6" fill="#1b1b24" />
    </>
  ),
  "nft-ufo": (
    <>
      <path d="M38 80 22 98h56L62 80z" fill="#9be8ff" opacity=".35" />
      <path d="M30 46C30 24 70 24 70 46z" fill="#9be8ff" /><path d="M36 42c2-10 10-14 18-14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      <circle cx="50" cy="38" r="6" fill="#7bd36a" /><circle cx="48" cy="37" r="1.4" fill="#1b1b24" /><circle cx="53" cy="37" r="1.4" fill="#1b1b24" />
      <ellipse cx="50" cy="56" rx="44" ry="15" fill="#aeb8c8" />
      <ellipse cx="50" cy="52" rx="44" ry="10" fill="#d4dbe6" />
      <circle cx="22" cy="58" r="3.6" fill="#ffd23f" /><circle cx="36" cy="63" r="3.6" fill="#ff6ec7" /><circle cx="50" cy="65" r="3.6" fill="#3bc9e8" /><circle cx="64" cy="63" r="3.6" fill="#ff6ec7" /><circle cx="78" cy="58" r="3.6" fill="#ffd23f" />
    </>
  ),
  "nft-moon": (
    <>
      <path d="M68 8C36 8 14 30 14 56c0 28 22 42 50 38-24-8-34-30-26-52 4-12 14-22 30-34z" fill="#f4e7a8" transform="translate(6 0)" />
      <path d="M64 8c-20 4-32 22-30 42 2-18 12-32 36-40z" fill="#fff" opacity=".35" transform="translate(6 0)" />
      <circle cx="40" cy="62" r="4" fill="#d9c373" opacity=".7" /><circle cx="34" cy="46" r="2.6" fill="#d9c373" opacity=".7" /><circle cx="48" cy="80" r="3" fill="#d9c373" opacity=".7" />
      <path d="M78 20l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM88 56l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#fff6c8" />
    </>
  ),
  "nft-galaxy": (
    <>
      <ellipse cx="50" cy="50" rx="44" ry="20" fill="#6d3fd1" opacity=".5" transform="rotate(-24 50 50)" />
      <ellipse cx="50" cy="50" rx="34" ry="14" fill="#a06bff" opacity=".6" transform="rotate(-24 50 50)" />
      <path d="M50 50c14-2 22-10 20-22M50 50c-14 2-22 10-20 22M50 50c2-14 10-22 22-20M50 50c-2 14-10 22-22 20" fill="none" stroke="#e5d0ff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="50" cy="50" r="9" fill="#fff6d8" /><circle cx="50" cy="50" r="14" fill="#ffe8a0" opacity=".35" />
      {[[16, 20], [82, 16], [88, 70], [14, 78], [60, 90], [34, 8]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 2.4} fill="#fff" />)}
    </>
  ),
  "nft-snowman": (
    <>
      <circle cx="50" cy="76" r="22" fill="#f1f6fb" /><circle cx="50" cy="46" r="16" fill="#f8fbff" />
      <path d="M32 70q18 12 36 0" fill="#000" opacity=".06" />
      <path d="M34 36h32l-4-22H38z" fill="#2a2f45" /><rect x="30" y="34" width="40" height="6" rx="3" fill="#2a2f45" /><rect x="38" y="28" width="24" height="4" fill="#e5484d" />
      <circle cx="44" cy="44" r="2.2" fill="#1b1b24" /><circle cx="56" cy="44" r="2.2" fill="#1b1b24" />
      <path d="M50 49 66 52 50 55z" fill="#ff8a1f" />
      <path d="M36 58q14 8 28 0l2 6q-16 8-32 0z" fill="#e5484d" /><path d="M60 62l6 14-8 2z" fill="#c43a3f" />
      <circle cx="50" cy="72" r="2.4" fill="#2a2f45" /><circle cx="50" cy="82" r="2.4" fill="#2a2f45" />
    </>
  ),
  "nft-cat": (
    <>
      <path d="M16 46 18 10l26 18zM84 46 82 10 56 28z" fill="#7b6fd0" /><path d="M22 36 23 20l12 9zM78 36 77 20 65 29z" fill="#f4a8c8" />
      <ellipse cx="50" cy="60" rx="35" ry="31" fill="#8d82e0" />
      <path d="M50 29 46 40h8z" fill="#ffd23f" />
      <ellipse cx="36" cy="56" rx="7.5" ry="9" fill="#ffe9a8" /><ellipse cx="64" cy="56" rx="7.5" ry="9" fill="#ffe9a8" />
      <ellipse cx="36" cy="57" rx="2.6" ry="7" fill="#1b1b24" /><ellipse cx="64" cy="57" rx="2.6" ry="7" fill="#1b1b24" />
      <path d="M46 68h8l-4 5z" fill="#f4a8c8" /><path d="M50 73q-5 6-11 3M50 73q5 6 11 3" fill="none" stroke="#2a2250" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 62 28 66M8 72 28 70M92 62 72 66M92 72 72 70" stroke="#e8e4ff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="78" cy="20" r="2" fill="#fff" /><circle cx="22" cy="86" r="1.6" fill="#fff" />
    </>
  ),
  "nft-fox": (
    <>
      <path d="M10 46 14 6l30 22zM90 46 86 6 56 28z" fill="#f07a1a" /><path d="M18 34 19 16l13 10zM82 34 81 16 69 26z" fill="#2a1a10" />
      <path d="M50 92 8 50c0-22 18-26 42-26s42 4 42 26z" fill="#f58a2a" />
      <path d="M50 92 28 66c8-4 14-12 22-8 8-4 14 4 22 8z" fill="#fff6ea" />
      <path d="M8 50c8 4 18 6 26 6M92 50c-8 4-18 6-26 6" fill="none" stroke="#fff6ea" strokeWidth="9" strokeLinecap="round" opacity=".9" />
      <ellipse cx="37" cy="48" rx="3" ry="4.4" fill="#1b1b24" /><ellipse cx="63" cy="48" rx="3" ry="4.4" fill="#1b1b24" />
      <circle cx="50" cy="84" r="4.4" fill="#1b1b24" />
    </>
  ),
  "nft-wolf": (
    <>
      <path d="M14 50 12 8l30 20zM86 50 88 8 58 28z" fill="#5f6b7d" /><path d="M20 38 20 18l12 9zM80 38 80 18 68 27z" fill="#2c3340" />
      <path d="M50 94C26 84 10 64 12 44c4-16 18-20 38-20s34 4 38 20c2 20-14 40-38 50z" fill="#8a96a8" />
      <path d="M50 94C36 86 30 72 32 60c6 2 12 0 18-8 6 8 12 10 18 8 2 12-4 26-18 34z" fill="#e6ebf2" />
      <path d="M32 42q7-6 13 2-7 5-13-2zM68 42q-7-6-13 2 7 5 13-2z" fill="#ffd23f" />
      <ellipse cx="38.5" cy="43.5" rx="2" ry="3" fill="#1b1b24" /><ellipse cx="61.5" cy="43.5" rx="2" ry="3" fill="#1b1b24" />
      <path d="M43 70h14l-7 9z" fill="#1b1b24" />
    </>
  ),
  "nft-pumpkin": (
    <>
      <path d="M50 24c4-8 8-12 14-14" fill="none" stroke="#3d8a2f" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="28" cy="62" rx="22" ry="28" fill="#e8721a" /><ellipse cx="72" cy="62" rx="22" ry="28" fill="#e8721a" />
      <ellipse cx="50" cy="62" rx="20" ry="30" fill="#ff8a2a" />
      <path d="M36 36c-6 16-6 38 0 52M64 36c6 16 6 38 0 52M50 32v60" fill="none" stroke="#b8500c" strokeWidth="2" opacity=".55" />
      <path d="M30 34q-10 4-8 14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".35" />
    </>
  ),
  "nft-tree": (
    <>
      <rect x="44" y="82" width="12" height="14" rx="2" fill="#7a4a24" />
      <path d="M50 4 72 34H60l16 24H62l20 28H18l20-28H24l16-24H28z" fill="#2fa04a" />
      <path d="M50 4 28 34h12L24 58h14L18 86h32z" fill="#000" opacity=".14" />
      <path d="M50 4 53 12l8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="#ffd23f" transform="translate(0 -2) scale(1 1)" />
      <circle cx="42" cy="44" r="3.6" fill="#e5484d" /><circle cx="58" cy="60" r="3.6" fill="#3b82f6" /><circle cx="38" cy="70" r="3.6" fill="#ffd23f" /><circle cx="62" cy="78" r="3.6" fill="#e5484d" /><circle cx="52" cy="28" r="3" fill="#ff6ec7" />
    </>
  ),
  "nft-bolt": (
    <>
      <path d="M58 2 16 56h26L34 98 86 40H58z" fill="#ffd23f" />
      <path d="M58 2 16 56h26L34 98 52 52H36z" fill="#fff" opacity=".28" />
      <path d="M58 2 86 40H58z" fill="#e6a800" opacity=".5" />
    </>
  ),
  "nft-sword": (
    <>
      <g transform="rotate(45 50 50)">
        <path d="M50 -4 58 12V62H42V12z" fill="#dfe6ef" /><path d="M50 -4 58 12V62H50z" fill="#9aa8bb" /><path d="M50 8V60" stroke="#fff" strokeWidth="1.6" opacity=".7" />
        <rect x="28" y="62" width="44" height="8" rx="4" fill="#f6c026" /><circle cx="28" cy="66" r="4.6" fill="#f6c026" /><circle cx="72" cy="66" r="4.6" fill="#f6c026" />
        <rect x="45" y="70" width="10" height="18" rx="3" fill="#7a3b1e" /><path d="M45 74h10M45 79h10M45 84h10" stroke="#4a2410" strokeWidth="1.6" />
        <circle cx="50" cy="94" r="6" fill="#f6c026" /><circle cx="50" cy="66" r="3" fill="#e5484d" />
      </g>
    </>
  ),
  "nft-potion": (
    <>
      <rect x="40" y="4" width="20" height="12" rx="3" fill="#a8723a" />
      <path d="M42 16h16v22l26 44c4 8-2 14-10 14H26c-8 0-14-6-10-14l26-44z" fill="#e6f4f1" opacity=".55" />
      <path d="M32 62h36l16 20c4 8-2 14-10 14H26c-8 0-14-6-10-14z" fill="#53d86a" />
      <path d="M32 62q9 6 18 0t18 0" fill="none" stroke="#b6f5c0" strokeWidth="3" opacity=".8" />
      <circle cx="42" cy="74" r="4" fill="#d8ffe0" opacity=".8" /><circle cx="58" cy="82" r="3" fill="#d8ffe0" opacity=".8" /><circle cx="52" cy="48" r="3" fill="#53d86a" /><circle cx="47" cy="38" r="2" fill="#53d86a" />
      <path d="M46 20v16" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".6" />
    </>
  ),
  "nft-ghost": (
    <>
      <path d="M14 94V46C14 22 30 8 50 8s36 14 36 38v48l-12-10-12 10-12-10-12 10-12-10z" fill="#f4f6ff" />
      <path d="M14 94V46C14 22 30 8 50 8c-14 6-22 20-22 40v40l-8-6z" fill="#fff" opacity=".6" />
      <ellipse cx="38" cy="46" rx="5.5" ry="8" fill="#1b1b24" /><ellipse cx="62" cy="46" rx="5.5" ry="8" fill="#1b1b24" />
      <ellipse cx="50" cy="66" rx="6" ry="8" fill="#1b1b24" />
      <circle cx="28" cy="60" r="5" fill="#ff9ec7" opacity=".5" /><circle cx="72" cy="60" r="5" fill="#ff9ec7" opacity=".5" />
    </>
  ),
  "nft-robot": (
    <>
      <path d="M50 4v14" stroke="#9aa8bb" strokeWidth="4" strokeLinecap="round" /><circle cx="50" cy="6" r="5" fill="#e5484d" />
      <rect x="6" y="40" width="9" height="22" rx="4" fill="#7b8aa0" /><rect x="85" y="40" width="9" height="22" rx="4" fill="#7b8aa0" />
      <rect x="14" y="18" width="72" height="68" rx="16" fill="#cdd6e3" /><rect x="14" y="18" width="72" height="68" rx="16" fill="none" stroke="#9aa8bb" strokeWidth="3" />
      <rect x="22" y="32" width="56" height="30" rx="10" fill="#1d2433" />
      <circle cx="38" cy="47" r="7" fill="#3bd6ff" /><circle cx="62" cy="47" r="7" fill="#3bd6ff" /><circle cx="40" cy="45" r="2.4" fill="#fff" /><circle cx="64" cy="45" r="2.4" fill="#fff" />
      <rect x="30" y="68" width="40" height="10" rx="5" fill="#9aa8bb" /><path d="M38 68v10M46 68v10M54 68v10M62 68v10" stroke="#6b7a90" strokeWidth="2" />
    </>
  ),
  "nft-eye": (
    <>
      <circle cx="50" cy="50" r="46" fill="#1e63c8" /><circle cx="50" cy="50" r="34" fill="#f4f8ff" /><circle cx="50" cy="50" r="22" fill="#38a8f0" /><circle cx="50" cy="50" r="11" fill="#0d1a33" />
      <circle cx="45" cy="45" r="3.6" fill="#fff" opacity=".85" /><circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="2" opacity=".25" />
    </>
  ),
  "nft-ice": (
    <>
      <path d="M50 8 88 28v44L50 92 12 72V28z" fill="#8fdcf5" />
      <path d="M50 8 88 28 50 48 12 28z" fill="#d8f6ff" /><path d="M50 48 88 28v44L50 92z" fill="#4db8e0" />
      <path d="M20 34 40 44M70 60 80 54" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      <path d="M50 8 12 28 50 48z" fill="#fff" opacity=".25" />
    </>
  ),
  "nft-butterfly": (
    <>
      <path d="M50 46C38 12 6 8 6 34c0 16 18 22 44 12z" fill="#4d8bff" /><path d="M50 54C36 56 12 62 18 82c6 14 28 6 32-28z" fill="#8a5cf6" />
      <path d="M50 46C62 12 94 8 94 34c0 16-18 22-44 12z" fill="#4d8bff" /><path d="M50 54c14 2 38 8 32 28-6 14-28 6-32-28z" fill="#8a5cf6" />
      <circle cx="26" cy="30" r="8" fill="#fff" opacity=".5" /><circle cx="74" cy="30" r="8" fill="#fff" opacity=".5" /><circle cx="28" cy="74" r="5" fill="#fff" opacity=".45" /><circle cx="72" cy="74" r="5" fill="#fff" opacity=".45" />
      <rect x="46" y="30" width="8" height="46" rx="4" fill="#2a2250" />
      <path d="M48 30C44 18 38 12 34 10M52 30c4-12 10-18 14-20" fill="none" stroke="#2a2250" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  "nft-whale": (
    <>
      <path d="M44 22c-4-10 0-16 6-18M44 22c4-10 12-14 18-12" fill="none" stroke="#9be8ff" strokeWidth="4" strokeLinecap="round" />
      <path d="M8 56C8 34 28 24 50 24s42 14 42 36c0 6-2 10-6 14l8-14c4 0 6 6 2 12-4 8-10 8-14 4-8 10-22 14-38 14C24 90 8 76 8 56z" fill="#3b82d6" />
      <path d="M8 56c0 20 18 34 40 34 16 0 28-4 36-14-10 4-26 6-44-2-14-6-26-12-32-18z" fill="#cfe6fa" />
      <circle cx="30" cy="50" r="3.6" fill="#1b1b24" /><circle cx="31" cy="49" r="1.2" fill="#fff" />
      <path d="M18 66q8 4 14 0" fill="none" stroke="#1b4a8a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M48 62 36 80c10 0 18-6 22-16z" fill="#2f6cb8" />
    </>
  ),
  "nft-music": (
    <>
      <path d="M34 78V20l48-10v56" fill="none" stroke="#f4f0ff" strokeWidth="7" strokeLinejoin="round" />
      <path d="M34 36 82 26" stroke="#f4f0ff" strokeWidth="7" />
      <ellipse cx="26" cy="80" rx="15" ry="11" fill="#b36bff" transform="rotate(-18 26 80)" /><ellipse cx="74" cy="68" rx="15" ry="11" fill="#ff6ec7" transform="rotate(-18 74 68)" />
      <path d="M18 76q4-5 10-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
    </>
  ),
  "nft-skull": (
    <>
      <path d="M50 4C26 4 10 20 10 42c0 12 6 20 14 26v14c0 4 3 8 8 8h36c5 0 8-4 8-8V68c8-6 14-14 14-26C90 20 74 4 50 4z" fill="#f2efe6" />
      <path d="M50 4C26 4 10 20 10 42c0 12 6 20 14 26v14c0 2 1 4 3 6V66C18 56 16 44 20 34 26 18 38 8 50 4z" fill="#fff" opacity=".5" />
      <ellipse cx="33" cy="44" rx="11" ry="12" fill="#1b1b24" /><ellipse cx="67" cy="44" rx="11" ry="12" fill="#1b1b24" />
      <circle cx="33" cy="44" r="3.6" fill="#ff4b1f" /><circle cx="67" cy="44" r="3.6" fill="#ff4b1f" />
      <path d="M50 56 44 68h12z" fill="#1b1b24" />
      <path d="M36 76v10M45 76v11M55 76v11M64 76v10" stroke="#1b1b24" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),

  /* ───────── Хеллоуин: лимитированная коллекция ───────── */
  "hw-jack": (
    <>
      <path d="M50 26c2-10 6-16 14-18" fill="none" stroke="#3d8a2f" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="26" cy="62" rx="22" ry="29" fill="#e8721a" /><ellipse cx="74" cy="62" rx="22" ry="29" fill="#e8721a" />
      <ellipse cx="50" cy="62" rx="21" ry="31" fill="#ff8a2a" />
      <path d="M34 34c-6 18-6 40 0 56M66 34c6 18 6 40 0 56" fill="none" stroke="#b8500c" strokeWidth="2" opacity=".5" />
      <path d="M22 52 38 44 36 58zM78 52 62 44 64 58z" fill="#2a0e00" />
      <path d="M50 60 44 70h12z" fill="#2a0e00" />
      <path d="M22 74q6 14 28 14t28-14l-8 2-6 6-6-6-8 6-8-6-6 6-6-6z" fill="#2a0e00" />
      <path d="M24 53 36 47 35 56zM76 53 64 47 65 56z" fill="#ffd23f" /><path d="M46 69h8l-4-6z" fill="#ffd23f" /><path d="M32 78l4 4 4-4zM60 78l4 4 4-4z" fill="#ffd23f" />
    </>
  ),
  "hw-ghost": (
    <>
      <path d="M14 94V50C14 28 30 14 50 14s36 14 36 36v44l-12-10-12 10-12-10-12 10-12-10z" fill="#f4f6ff" />
      <path d="M14 94V50C14 28 30 14 50 14c-14 6-22 18-22 38v36l-8-6z" fill="#fff" opacity=".6" />
      <rect x="28" y="6" width="44" height="8" rx="3" fill="#2a2f45" /><rect x="36" y="-8" width="28" height="18" rx="3" fill="#2a2f45" /><rect x="36" y="2" width="28" height="4.5" fill="#b36bff" />
      <circle cx="36" cy="46" r="8.5" fill="none" stroke="#f6c026" strokeWidth="2.4" /><path d="M28 54 24 66" stroke="#f6c026" strokeWidth="1.6" />
      <ellipse cx="36" cy="46" rx="4.2" ry="6" fill="#1b1b24" /><ellipse cx="62" cy="46" rx="4.2" ry="6" fill="#1b1b24" />
      <path d="M40 66q10 10 20 0" fill="none" stroke="#1b1b24" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 80 50 74 62 80 50 86z" fill="#b36bff" />
    </>
  ),
  "hw-bat": (
    <>
      <path d="M50 38C42 22 24 14 4 22c8 4 10 10 8 18 6-2 10 0 12 8 6-4 12-2 14 4 4-4 8-4 12 0z" fill="#3a2a5a" />
      <path d="M50 38C58 22 76 14 96 22c-8 4-10 10-8 18-6-2-10 0-12 8-6-4-12-2-14 4-4-4-8-4-12 0z" fill="#3a2a5a" />
      <path d="M50 38C38 28 24 24 10 26M50 38C40 34 28 36 18 42M50 38C58 28 72 24 90 26M50 38C60 34 72 36 82 42" fill="none" stroke="#6b4aa0" strokeWidth="2" />
      <ellipse cx="50" cy="56" rx="17" ry="22" fill="#4a3470" />
      <path d="M36 40 34 22l12 10zM64 40 66 22 54 32z" fill="#4a3470" />
      <circle cx="43" cy="50" r="4.4" fill="#ff4b1f" /><circle cx="57" cy="50" r="4.4" fill="#ff4b1f" /><circle cx="43" cy="50" r="1.6" fill="#1b1b24" /><circle cx="57" cy="50" r="1.6" fill="#1b1b24" />
      <path d="M44 62h12l-2 8-4-4-4 4z" fill="#fff" />
    </>
  ),
  "hw-hat": (
    <>
      <path d="M50 4C54 20 60 36 66 62H34c6-26 10-40 16-58z" fill="#5b2bd1" />
      <path d="M50 4C52 20 56 34 60 62H34c6-26 10-40 16-58z" fill="#000" opacity=".12" />
      <path d="M62 40c8-8 10-18 6-28 6 6 8 18 0 28z" fill="#5b2bd1" />
      <ellipse cx="50" cy="68" rx="46" ry="12" fill="#3b1c96" /><ellipse cx="50" cy="64" rx="46" ry="11" fill="#5b2bd1" />
      <path d="M36 62h28l2 8H34z" fill="#1b1b24" opacity=".0" />
      <rect x="35" y="50" width="30" height="11" fill="#1b1b24" /><rect x="44" y="48" width="12" height="15" rx="2" fill="none" stroke="#f6c026" strokeWidth="3" />
      <path d="M44 30l1.6 4 4 .6-3 3 .8 4-3.4-2-3.4 2 .8-4-3-3 4-.6z" fill="#ffd23f" transform="translate(-4 -4) scale(.9)" />
      <circle cx="56" cy="26" r="2" fill="#ffd23f" /><circle cx="60" cy="40" r="1.6" fill="#ffd23f" />
    </>
  ),
  "hw-spider": (
    <>
      <path d="M50 -10V34" stroke="#cfd6e3" strokeWidth="1.6" />
      <g stroke="#1b1b24" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M42 52 24 38 12 52M40 58 18 58 8 76M42 64 24 78 18 92M44 68 36 84 36 96" />
        <path d="M58 52 76 38 88 52M60 58 82 58 92 76M58 64 76 78 82 92M56 68 64 84 64 96" />
      </g>
      <ellipse cx="50" cy="66" rx="18" ry="22" fill="#2a2250" /><circle cx="50" cy="42" r="12" fill="#3a2f70" />
      <path d="M44 58 50 50 56 58 50 74z" fill="#ff4b1f" />
      <circle cx="45" cy="40" r="3.4" fill="#ffd23f" /><circle cx="55" cy="40" r="3.4" fill="#ffd23f" /><circle cx="45" cy="40" r="1.3" fill="#1b1b24" /><circle cx="55" cy="40" r="1.3" fill="#1b1b24" />
    </>
  ),
  "hw-cauldron": (
    <>
      <path d="M30 94 22 84M70 94 78 84" stroke="#2a2a33" strokeWidth="5" strokeLinecap="round" />
      <path d="M28 84c-8-6 0 8 4 10-6 2-6 4 0 4zM50 98c-6-8-4-12 0-16 4 4 6 8 0 16z" fill="#ff7a1a" />
      <path d="M6 36h88l-4 10c6 14 2 34-14 42H24C8 80 4 60 10 46z" fill="#2a2a33" />
      <path d="M6 36h88l-2 6H8z" fill="#46465a" />
      <ellipse cx="50" cy="36" rx="44" ry="9" fill="#53d86a" /><ellipse cx="50" cy="36" rx="34" ry="6" fill="#8bf09a" />
      <circle cx="36" cy="14" r="8" fill="#53d86a" opacity=".85" /><circle cx="56" cy="8" r="6" fill="#8bf09a" opacity=".85" /><circle cx="68" cy="22" r="5" fill="#53d86a" opacity=".85" /><circle cx="46" cy="26" r="3.6" fill="#b8ffc4" />
      <path d="M18 54q-4 12 4 22" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" opacity=".2" />
    </>
  ),
  "hw-candy": (
    <>
      <path d="M22 50 4 36v28zM78 50l18-14v28z" fill="#ff9f1c" /><path d="M22 50 4 36M22 50 4 64M78 50l18-14M78 50l18 14" stroke="#e66a00" strokeWidth="2" />
      <ellipse cx="50" cy="50" rx="30" ry="24" fill="#ff6a1a" />
      <path d="M32 30q18 8 36 0M26 44q24 12 48 0M26 58q24 12 48 0M32 72q18-8 36 0" fill="none" stroke="#2a0e00" strokeWidth="5" opacity=".85" />
      <ellipse cx="38" cy="38" rx="8" ry="5" fill="#fff" opacity=".35" transform="rotate(-24 38 38)" />
      <path d="M50 40c2-4 8-4 10 0 2 6-6 10-10 14-4-4-12-8-10-14 2-4 8-4 10 0z" fill="#ffd23f" transform="translate(0 4) scale(.8) translate(12 6)" />
    </>
  ),
  "hw-cat": (
    <>
      <path d="M72 78c18-4 24-24 14-40" fill="none" stroke="#1b1b24" strokeWidth="9" strokeLinecap="round" />
      <path d="M22 96c-6-24 0-48 14-58l28 0c14 10 20 34 14 58z" fill="#23232e" />
      <circle cx="50" cy="32" r="22" fill="#2a2a38" />
      <path d="M32 20 30 2l14 10zM68 20 70 2 56 12z" fill="#2a2a38" /><path d="M34 14 33 8l6 4zM66 14 67 8l-6 4z" fill="#f4a8c8" />
      <ellipse cx="41" cy="30" rx="5" ry="6.4" fill="#ffb02e" /><ellipse cx="59" cy="30" rx="5" ry="6.4" fill="#ffb02e" />
      <ellipse cx="41" cy="30" rx="1.8" ry="5.4" fill="#1b1b24" /><ellipse cx="59" cy="30" rx="1.8" ry="5.4" fill="#1b1b24" />
      <path d="M47 39h6l-3 3z" fill="#f4a8c8" />
      <path d="M26 38 14 36M26 43 14 45M74 38 86 36M74 43 86 45" stroke="#d8d8e8" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M30 96v-14M70 96V82" stroke="#3a3a4a" strokeWidth="6" strokeLinecap="round" />
    </>
  ),
  "hw-vampire": (
    <>
      <path d="M2 98 14 62 50 78 86 62 98 98z" fill="#2a0e14" /><path d="M14 62 28 50 50 80z" fill="#c4182f" /><path d="M86 62 72 50 50 80z" fill="#c4182f" />
      <path d="M24 54 22 20 38 6 50 14 62 6 78 20 76 54z" fill="#1b1b24" />
      <ellipse cx="50" cy="48" rx="25" ry="30" fill="#ece4f2" />
      <path d="M25 30c8-2 14-10 18-18 4 8 10 14 14 14 4 0 12-8 18-14 0 8 2 14 0 20-12-6-34-6-50-2z" fill="#1b1b24" />
      <path d="M36 42 46 44M64 42 54 44" stroke="#1b1b24" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="48" r="4" fill="#c4182f" /><circle cx="60" cy="48" r="4" fill="#c4182f" /><circle cx="40" cy="48" r="1.4" fill="#1b1b24" /><circle cx="60" cy="48" r="1.4" fill="#1b1b24" />
      <path d="M36 64q14 8 28 0" fill="#6b0f20" stroke="#6b0f20" strokeWidth="2" /><path d="M40 65 42 74 45 66zM60 65 58 74 55 66z" fill="#fff" />
    </>
  ),
  "hw-house": (
    <>
      <circle cx="78" cy="20" r="12" fill="#ffe9a8" opacity=".9" />
      <path d="M62 48V22l8-14 8 14v26z" fill="#2c1b44" /><path d="M58 24 70 4l12 20z" fill="#1d1130" />
      <rect x="12" y="48" width="76" height="44" fill="#3a2650" /><path d="M6 52 50 16l44 36z" fill="#1d1130" /><path d="M6 52 50 16l-6 36z" fill="#fff" opacity=".07" />
      <rect x="22" y="60" width="11" height="15" rx="2" fill="#ffb02e" /><rect x="44.5" y="60" width="11" height="12" rx="2" fill="#ffb02e" /><rect x="67" y="60" width="11" height="15" rx="2" fill="#ffb02e" />
      <path d="M42 92V78a8 8 0 0116 0v14z" fill="#150c24" /><rect x="66" y="26" width="8" height="10" rx="2" fill="#ff7a1a" />
      <path d="M4 94h92" stroke="#150c24" strokeWidth="5" strokeLinecap="round" /><path d="M14 94c-2-10 0-18 4-24M88 94c2-8 0-14-4-20" stroke="#150c24" strokeWidth="3" fill="none" />
    </>
  ),
  "hw-coffin": (
    <>
      <path d="M34 4h32l20 30-20 62H34L14 34z" fill="#4a2f78" /><path d="M36 10h28l15 24-17 54H38L21 34z" fill="#6a46a8" />
      <path d="M34 4h32l20 30-20 62H34L14 34z" fill="none" stroke="#2a1a4a" strokeWidth="3" />
      <rect x="46" y="22" width="8" height="40" rx="2" fill="#f6c026" /><rect x="35" y="34" width="30" height="8" rx="2" fill="#f6c026" />
      <path d="M24 34 36 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".3" />
    </>
  ),
  "hw-tomb": (
    <>
      <path d="M18 96V42a32 32 0 0164 0v54z" fill="#8f96a6" /><path d="M18 96V42a32 32 0 0164 0v54H70V44a20 20 0 00-40 0v52z" fill="#fff" opacity=".12" />
      <path d="M26 96V44a24 24 0 0148 0v52z" fill="#a7aebd" />
      <text x="50" y="52" fontSize="17" fontWeight="800" textAnchor="middle" fill="#4a5060">RIP</text><path d="M38 60h24" stroke="#4a5060" strokeWidth="2.4" />
      <path d="M10 96h80" stroke="#2f6a2a" strokeWidth="7" strokeLinecap="round" /><path d="M22 90c4-4 8-4 10 2M72 92c4-6 8-4 10 0" stroke="#3f8a35" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M62 34 54 48M66 40 60 52" stroke="#6b7384" strokeWidth="1.6" />
    </>
  ),
  "hw-candles": (
    <>
      {[[22, 46, 54, 28], [44, 30, 70, 38], [66, 52, 48, 26]].map(([x, y, h, w], i) => (
        <g key={i}>
          <rect x={x} y={y + 14} width={w - 8} height={h} rx="3" fill="#f6ecd2" /><rect x={x} y={y + 14} width={7} height={h} rx="3" fill="#fff" opacity=".35" />
          <path d={`M${x + 2} ${y + 14}q0 10 4 10t4-10`} fill="#e8d9b0" /><ellipse cx={x + (w - 8) / 2} cy={y + 14} rx={(w - 8) / 2} ry="2.6" fill="#e8d9b0" />
          <path d={`M${x + (w - 8) / 2} ${y - 6}c8 8 6 14 0 18-6-4-8-10 0-18z`} fill="#ff9f1c" /><path d={`M${x + (w - 8) / 2} ${y + 2}c4 4 3 7 0 9-3-2-4-5 0-9z`} fill="#fff3a0" />
        </g>
      ))}
      <ellipse cx="50" cy="94" rx="40" ry="5" fill="#2a1a3a" />
    </>
  ),
  "hw-eye": (
    <>
      <circle cx="50" cy="52" r="38" fill="#f8f2ee" /><circle cx="50" cy="52" r="38" fill="none" stroke="#d9c9c4" strokeWidth="2" />
      <path d="M14 46 28 48M18 66 32 60M86 44 72 48M84 68 70 62M40 16 42 28M62 16 58 28" stroke="#d8484f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="50" cy="54" r="19" fill="#4fb26a" /><circle cx="50" cy="54" r="19" fill="none" stroke="#2a7a44" strokeWidth="3" /><circle cx="50" cy="54" r="9" fill="#12121a" />
      <circle cx="43" cy="46" r="5" fill="#fff" opacity=".9" /><circle cx="58" cy="62" r="2.4" fill="#fff" opacity=".6" />
      <path d="M40 88q10 10 20 0v8H40z" fill="#c4182f" />
    </>
  ),
  "hw-hourglass": (
    <>
      <rect x="18" y="4" width="64" height="9" rx="4" fill="#7a4a24" /><rect x="18" y="87" width="64" height="9" rx="4" fill="#7a4a24" />
      <path d="M26 13h48c0 22-14 30-14 37s14 15 14 37H26c0-22 14-30 14-37s-14-15-14-37z" fill="#dff0ff" opacity=".35" stroke="#cfe3f5" strokeWidth="2.4" />
      <path d="M32 18h36c-2 12-10 18-18 20-8-2-16-8-18-20z" fill="#ff9f1c" />
      <path d="M50 52v20" stroke="#ff9f1c" strokeWidth="2" /><path d="M32 84c2-10 8-16 18-16s16 6 18 16z" fill="#ffb02e" />
      <path d="M30 18c0 12 6 20 12 26" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7" fill="none" />
    </>
  ),
  "hw-tree": (
    <>
      <circle cx="50" cy="40" r="32" fill="#ff8a1f" /><circle cx="50" cy="40" r="32" fill="#fff" opacity=".1" />
      <path d="M44 96c2-20 2-34-2-48-6-2-14-8-16-18 6 6 12 8 18 8-4-8-4-18 2-26 0 10 6 18 10 22 2-8 8-14 14-16-4 8-4 14-2 20 6-2 12-6 14-14 2 10-4 18-14 22-2 14-2 28 2 50z" fill="#1d1130" />
      <path d="M30 60c8-2 14 0 18 6M72 56c-6 0-12 4-16 10" stroke="#1d1130" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M8 96h84" stroke="#1d1130" strokeWidth="6" strokeLinecap="round" /><path d="M14 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff6c8" />
    </>
  ),
  "hw-rose": (
    <>
      <path d="M50 54C52 72 50 84 54 96" fill="none" stroke="#2f8a3f" strokeWidth="5" strokeLinecap="round" />
      <path d="M52 76c10-10 20-8 24-2-8 8-18 8-24 2z" fill="#3fae5a" /><path d="M50 84c-8-8-16-6-20-2 6 8 14 8 20 2z" fill="#2f8a3f" />
      <path d="M50 8C28 8 14 26 20 44c4 12 18 18 30 14 12 4 26-2 30-14C86 26 72 8 50 8z" fill="#d11f3f" />
      <path d="M50 14c-14 2-20 12-16 22 4 6 12 6 16 2 4 4 12 4 16-2 4-10-2-20-16-22z" fill="#e8355a" />
      <path d="M40 30c4-6 16-6 20 0-2 8-6 10-10 8-4 2-8 0-10-8z" fill="#a8142f" /><path d="M44 28q6-4 12 0" stroke="#ff8aa0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M26 24q4-8 14-10" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" opacity=".4" fill="none" />
    </>
  ),
};

/** Размещение фигурки внутри 200×200 карточки NftArt. */
/* Дополнительные оригинальные фигурки (часы, кольцо, самоцвет, огненное сердце, лягушка, пёс, кот). Оттенок модели красит их поверх. */
Object.assign(NFT_FIGURES, {
  "nft-watch": (
    <>
      <path d="M37 4h26l3 24H34z" fill="#d99a2b" /><path d="M34 72h32l-3 24H37z" fill="#d99a2b" />
      <path d="M36 12h28M35 19h30M35 81h30M36 88h28" stroke="#a86f12" strokeWidth="1.7" />
      <rect x="82" y="44" width="7" height="12" rx="2.5" fill="#c2851c" />
      <circle cx="50" cy="50" r="33" fill="#f5c04a" /><circle cx="50" cy="50" r="33" fill="none" stroke="#b97d12" strokeWidth="2.2" />
      <circle cx="50" cy="50" r="27.5" fill="#ffd978" />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x="49" y="22.5" width="2" height={i % 3 === 0 ? 5 : 3} fill="#9a650c" transform={`rotate(${i * 30} 50 50)`} />)}
      <circle cx="50" cy="50" r="21" fill="#1c2735" /><circle cx="50" cy="50" r="21" fill="none" stroke="#7de0c1" strokeWidth="1.1" />
      <circle cx="50" cy="33" r="1.8" fill="#ffd978" /><circle cx="67" cy="50" r="1.8" fill="#ffd978" /><circle cx="50" cy="67" r="1.8" fill="#ffd978" /><circle cx="33" cy="50" r="1.8" fill="#ffd978" />
      <path d="M50 50V36" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /><path d="M50 50 60 57" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M50 50 38 60" stroke="#ff6b6b" strokeWidth="1.1" strokeLinecap="round" /><circle cx="50" cy="50" r="2.6" fill="#ffd978" />
      <path d="M28 36a26 26 0 0 1 22-16" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
    </>
  ),
  "nft-ring": (
    <>
      <path d="M18 46 25 10h50l7 36z" fill="#9c2424" /><path d="M25 44 30 15h40l5 29z" fill="#6a1212" />
      <path d="M12 48h76l-6 40H18z" fill="#d63b3b" /><path d="M12 48h76v9H12z" fill="#ef6262" /><path d="M18 88 12 48h8l4 40z" fill="#000" opacity=".12" />
      <rect x="21" y="55" width="58" height="9" rx="4" fill="#2a0c0c" />
      <ellipse cx="50" cy="46" rx="14" ry="18" fill="none" stroke="#ffd34d" strokeWidth="5.5" />
      <ellipse cx="50" cy="46" rx="14" ry="18" fill="none" stroke="#fff3b0" strokeWidth="1.4" strokeDasharray="10 40" strokeDashoffset="6" />
      <path d="M50 14 59 22 50 32 41 22z" fill="#9be9ff" /><path d="M41 22 50 14 59 22H41z" fill="#e4fbff" /><path d="M50 32 41 22h18z" fill="#4cc6f2" /><path d="M50 32 50 22 59 22z" fill="#7fdcff" />
      <path d="M62 10l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fff" opacity=".9" />
    </>
  ),
  "nft-gem": (
    <>
      <path d="M12 54 22 34l12 18-4 30H16z" fill="#3fb6e6" /><path d="M22 34 34 52 22 82 16 82 12 54z" fill="#2792c4" />
      <path d="M88 54 78 34 66 52l4 30h14z" fill="#3fb6e6" /><path d="M78 34 66 52 78 82h6l4-28z" fill="#8fe6ff" opacity=".7" />
      <path d="M50 4 68 26 63 78 50 96 37 78 32 26z" fill="#5fd3ff" /><path d="M50 4 32 26 37 78 50 96z" fill="#2aa4d8" />
      <path d="M32 26 50 4 68 26 50 36z" fill="#d4f7ff" /><path d="M50 36 32 26 37 78 50 96z" fill="#2aa4d8" opacity=".55" /><path d="M50 36 68 26 63 78 50 96z" fill="#9ae9ff" />
      <path d="M44 14 38 30" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".8" />
      <path d="M80 12l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fff" opacity=".9" />
    </>
  ),
  "nft-flameheart": (
    <>
      <path d="M50 2c6 12 20 14 22 32 1 9-4 15-4 15s12-3 18 9c-3 22-26 34-36 38C40 92 17 80 12 58c4-11 15-9 15-9s-5-5-4-15C25 18 42 14 50 2z" fill="#ff8a1f" />
      <path d="M50 14c5 9 14 11 15 24 0 6-3 10-3 10s9-1 11 7C70 64 56 70 50 72c-8-2-22-8-24-17 3-7 11-5 11-5s-4-4-3-12c2-12 12-14 16-24z" fill="#ffd23f" />
      <path d="M50 84C26 68 18 54 18 42a16 16 0 0 1 32-4 16 16 0 0 1 32 4c0 12-8 26-32 42z" fill="#e5192e" />
      <path d="M26 38a10 10 0 0 1 14-8" fill="none" stroke="#ff8a8a" strokeWidth="3" strokeLinecap="round" opacity=".8" />
    </>
  ),
  "nft-frog": (
    <>
      <ellipse cx="26" cy="90" rx="13" ry="6" fill="#2ab547" /><ellipse cx="74" cy="90" rx="13" ry="6" fill="#2ab547" />
      <ellipse cx="50" cy="68" rx="31" ry="24" fill="#39d353" /><ellipse cx="50" cy="76" rx="19" ry="14" fill="#b4f58f" />
      <ellipse cx="50" cy="44" rx="33" ry="23" fill="#39d353" />
      <circle cx="31" cy="26" r="14" fill="#39d353" /><circle cx="69" cy="26" r="14" fill="#39d353" />
      <circle cx="31" cy="26" r="11" fill="#fff" /><circle cx="69" cy="26" r="11" fill="#fff" />
      <circle cx="33" cy="28" r="5.8" fill="#16241a" /><circle cx="67" cy="28" r="5.8" fill="#16241a" />
      <circle cx="35" cy="25.5" r="1.9" fill="#fff" /><circle cx="69" cy="25.5" r="1.9" fill="#fff" />
      <path d="M24 52q26 22 52 0" fill="none" stroke="#17692a" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M43 59q7 12 14 0z" fill="#ff5c8a" />
      <circle cx="44" cy="45" r="1.4" fill="#17692a" /><circle cx="56" cy="45" r="1.4" fill="#17692a" />
    </>
  ),
  "nft-dog": (
    <>
      <path d="M20 26 5 60l19 10 8-36z" fill="#5c6675" /><path d="M80 26 95 60 76 70 68 34z" fill="#5c6675" />
      <ellipse cx="50" cy="52" rx="31" ry="29" fill="#e8eff7" /><ellipse cx="50" cy="66" rx="17" ry="13" fill="#fff" />
      <ellipse cx="50" cy="58" rx="6.5" ry="4.8" fill="#222831" />
      <circle cx="37" cy="44" r="8" fill="#fff" stroke="#9aa6b5" strokeWidth="1.4" /><circle cx="63" cy="44" r="8" fill="#fff" stroke="#9aa6b5" strokeWidth="1.4" />
      <circle cx="37" cy="47" r="4.4" fill="#1b2330" /><circle cx="63" cy="47" r="4.4" fill="#1b2330" />
      <path d="M26 34 44 39M74 34 56 39" stroke="#5c6675" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M34 53q-4 11-1 20q5-8 1-20zM66 53q4 11 1 20q-5-8-1-20z" fill="#5ac8fa" />
      <path d="M42 72q8-6 16 0" fill="none" stroke="#222831" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="50" cy="93" rx="22" ry="7" fill="#d4dde8" />
    </>
  ),
  "nft-catarms": (
    <>
      <path d="M38 52 4 42l3 11 31 11z" fill="#ff7eb6" /><path d="M62 52 96 42l-3 11-31 11z" fill="#ff7eb6" />
      <path d="M36 50h28l5 32H31z" fill="#fff0f6" /><path d="M36 50h28l1 8H35z" fill="#ffc2dc" opacity=".6" />
      <rect x="35" y="78" width="11" height="17" rx="5" fill="#ff7eb6" /><rect x="54" y="78" width="11" height="17" rx="5" fill="#ff7eb6" />
      <path d="M33 22 30 4l16 9zM67 22 70 4 54 13z" fill="#ff7eb6" /><path d="M35 20 34 10l8 5zM65 20 66 10l-8 5z" fill="#ffc2dc" />
      <circle cx="50" cy="32" r="21" fill="#ff7eb6" />
      <circle cx="42" cy="31" r="2.8" fill="#2a1420" /><circle cx="58" cy="31" r="2.8" fill="#2a1420" />
      <path d="M47 38q3 3 6 0" fill="none" stroke="#2a1420" strokeWidth="2" strokeLinecap="round" /><path d="M50 35v3" stroke="#2a1420" strokeWidth="2" />
      <circle cx="35" cy="37" r="3.4" fill="#ff4f93" opacity=".5" /><circle cx="65" cy="37" r="3.4" fill="#ff4f93" opacity=".5" />
    </>
  ),
});

export function NftFigure({ id }: { id: string }) {
  const fig = NFT_FIGURES[id];
  if (!fig) return null;
  return <g transform="translate(40 34) scale(1.2)">{fig}</g>;
}

export const hasNftFigure = (id: string) => id in NFT_FIGURES;

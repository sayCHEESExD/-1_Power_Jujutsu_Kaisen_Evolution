/**
 * The HUD's icons: the supplied images where there is one (rebirth,
 * upgrades, trophy, shoe, lightning, sound), and small inline SVGs for the
 * rest - the cursed-energy flame, a sorcerer's head, the torii portal of the
 * Worlds menu, the four-leaf clover of Luck, the boss skull, the fist, the
 * podium of the boards, the invite heads, the close X, the impact burst.
 */
const img = (src: string, alt: string): string => `<img class="sp-icon-img" src="${src}" alt="${alt}" draggable="false" />`;

/** A violet flame of cursed energy: the "Cursed Energy" readouts and every "+N" popup. */
const FLAME_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">' +
  '<path d="M32 4c4 10 16 14 16 30 0 12-7 24-16 24S16 46 16 34c0-9 6-12 7-20 4 5 3 10 5 12 2-8 0-14 4-22z" fill="#7a3aff" stroke="#120a2a" stroke-width="3.5" stroke-linejoin="round"/>' +
  '<path d="M32 26c3 6 8 8 8 16 0 6-4 11-8 11s-8-5-8-11c0-5 3-7 4-11 2 3 2 5 3 6 1-4 0-7 1-11z" fill="#c8a8ff"/>' +
  '<path d="M32 40c1 3 3 4 3 7s-1 5-3 5-3-2-3-5 2-4 3-7z" fill="#ffffff"/></svg>';

export const flameIconUrl = `data:image/svg+xml;utf8,${encodeURIComponent(FLAME_SVG)}`;

/**
 * A comic IMPACT BURST - a jagged yellow star over an ink outline - that the
 * LEVEL UP banner and the big announcements wear.
 */
const BURST_SVG = ((): string => {
  const c = 50;
  const points: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 === 0 ? 47 : 30 + ((i * 7) % 5);
    points.push(`${(c + Math.cos(a) * r).toFixed(1)},${(c + Math.sin(a) * r).toFixed(1)}`);
  }
  const star = points.join(' ');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<polygon points="${star}" fill="#ffd23a" stroke="#0d0f18" stroke-width="5" stroke-linejoin="round"/>` +
    `<polygon points="${star}" fill="none" stroke="#fff4b0" stroke-width="2" transform="translate(50 50) scale(0.7) translate(-50 -50)"/></svg>`
  );
})();

export const burstUrl = `data:image/svg+xml;utf8,${encodeURIComponent(BURST_SVG)}`;

export const ICON = {
  rebirth: img('/ui/rebirth.png', 'Rebirth'),
  upgrades: img('/ui/Upgrades.png', 'Upgrades'),
  trophy: img('/ui/trophy.png', 'Wins'),
  sound: img('/ui/Sound.png', 'Music'),
  shoe: img('/ui/shoe.png', 'Speed'),
  lightning: img('/ui/energy.png', 'Punch Rate'),
  flame: FLAME_SVG,
  flameImg: `<img src="${flameIconUrl}" alt="" draggable="false" />`,
  burst: `<img class="sp-burst" src="${burstUrl}" alt="" draggable="false" />`,
  /** A sorcerer's head: spiky pink hair over a high navy collar - the Characters menu. */
  characters:
    '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    '<path d="M12 60c0-10 9-16 20-16s20 6 20 16z" fill="#1b1f33" stroke="#0d0f18" stroke-width="3"/>' +
    '<rect x="18" y="16" width="28" height="28" rx="6" fill="#f6cfa8" stroke="#0d0f18" stroke-width="3.5"/>' +
    '<path d="M14 24l4-14 6 8 4-12 5 10 6-11 3 12 7-7-1 14z" fill="#f07aa8" stroke="#0d0f18" stroke-width="3" stroke-linejoin="round"/>' +
    '<rect x="23" y="29" width="5" height="6" rx="1.5" fill="#0d0f18"/><rect x="36" y="29" width="5" height="6" rx="1.5" fill="#0d0f18"/>' +
    '<path d="M22 37h7M35 37h7" stroke="#8a1a1a" stroke-width="1.6"/><path d="M28 40h8" stroke="#8a3a2a" stroke-width="2.4" stroke-linecap="round"/></svg>',
  /** A red torii before a swirling violet portal - the Worlds menu. */
  worlds:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="25" fill="#4a1a9a" stroke="#0d0f18" stroke-width="3.5"/>' +
    '<path d="M32 14a20 20 0 1 1-17 9" fill="none" stroke="#c88aff" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M32 24a10 10 0 1 1-9 5" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M8 12h48l-3 6H11z" fill="#e0342b" stroke="#0d0f18" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M14 22h36" stroke="#0d0f18" stroke-width="7"/><path d="M14 22h36" stroke="#e0342b" stroke-width="3.5"/>' +
    '<path d="M18 18v42M46 18v42" stroke="#0d0f18" stroke-width="8"/><path d="M18 18v42M46 18v42" stroke="#e0342b" stroke-width="4.5"/></svg>',
  /** Licking flames of an aura. */
  auras:
    '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    '<path d="M32 4c6 10 22 16 22 34 0 12-10 22-22 22S10 50 10 38c0-10 6-14 8-22 4 6 4 12 6 14 2-10 2-18 8-26z" fill="#ff3a2a" stroke="#1a0404" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<path d="M32 22c4 8 12 10 12 20 0 7-5 13-12 13s-12-6-12-13c0-6 4-8 5-13 3 4 3 7 4 8 1-6 1-10 3-15z" fill="#ffb03a"/>' +
    '<circle cx="32" cy="44" r="6" fill="#4a1010"/><circle cx="29" cy="42" r="1.6" fill="#ffd23a"/><circle cx="35" cy="42" r="1.6" fill="#ffd23a"/></svg>',
  /** A four-leaf clover: Luck. */
  clover:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#0d200d" stroke-width="3">' +
    '<circle cx="22" cy="22" r="12" fill="#3ad84a"/><circle cx="42" cy="22" r="12" fill="#3ad84a"/><circle cx="22" cy="42" r="12" fill="#3ad84a"/><circle cx="42" cy="42" r="12" fill="#3ad84a"/></g>' +
    '<circle cx="32" cy="32" r="6" fill="#7dff6a" stroke="#0d200d" stroke-width="2.5"/><path d="M36 38l10 20" stroke="#0d200d" stroke-width="5" stroke-linecap="round"/></svg>',
  /** A cracked curse's skull with horns: Boss Damage. */
  boss:
    '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    '<path d="M12 14 18 28M52 14 46 28" stroke="#0d0f18" stroke-width="8" stroke-linecap="round"/><path d="M12 14 18 28M52 14 46 28" stroke="#5a2a2a" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M14 32c0-11 8-18 18-18s18 7 18 18c0 6-3 10-6 12v8H20v-8c-3-2-6-6-6-12z" fill="#f4f0e8" stroke="#0d0f18" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<circle cx="25" cy="33" r="5" fill="#ff2a3a"/><circle cx="39" cy="33" r="5" fill="#ff2a3a"/><path d="M27 46v6M32 46v6M37 46v6" stroke="#0d0f18" stroke-width="2.4"/>' +
    '<path d="M33 14l-3 8 4 4-2 6" fill="none" stroke="#0d0f18" stroke-width="2"/></svg>',
  /** A fist: Punch Rate's partner, and the auto clicker. */
  fist:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 26c0-6 4-10 10-10h16c6 0 10 4 10 10v14c0 8-6 14-14 14H28c-7 0-12-6-12-13z" fill="#f6cfa8" stroke="#0d0f18" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M24 16v10M32 16v10M40 16v10" stroke="#0d0f18" stroke-width="2.6"/><path d="M6 14l6 4M8 6l6 7M16 4l3 8" stroke="#b88aff" stroke-width="3" stroke-linecap="round"/></svg>',
  /** A podium: the leaderboards. */
  boards:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#0d0f18" stroke-width="3" stroke-linejoin="round">' +
    '<rect x="23" y="18" width="18" height="40" fill="#ffd23a"/><rect x="6" y="30" width="17" height="28" fill="#c8d0e0"/><rect x="41" y="38" width="17" height="20" fill="#ff9a3a"/></g>' +
    '<path d="M32 4l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z" fill="#fff27a" stroke="#0d0f18" stroke-width="2"/>' +
    '<text x="32" y="44" font-family="Fredoka, sans-serif" font-weight="700" font-size="16" text-anchor="middle" fill="#0d0f18">1</text></svg>',
  /** Two heads: invite a friend. */
  invite:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="30" y="14" width="22" height="22" rx="6" fill="#4ab8ff" stroke="#0d0f18" stroke-width="3"/><rect x="10" y="20" width="24" height="24" rx="6" fill="#ffd23a" stroke="#0d0f18" stroke-width="3.5"/>' +
    '<circle cx="18" cy="31" r="2.2" fill="#0d0f18"/><circle cx="26" cy="31" r="2.2" fill="#0d0f18"/><path d="M17 37c3 3 7 3 10 0" stroke="#0d0f18" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
    '<path d="M8 50h28v6H8zM30 44h26v6H30z" fill="#ff5a8a" stroke="#0d0f18" stroke-width="2.6"/></svg>',
  /** Crossed blades over a red disc: the PvP arena. */
  pvp:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="#c8101c" stroke="#0d0f18" stroke-width="3.5"/>' +
    '<path d="M18 46 46 18M18 18l28 28" stroke="#0d0f18" stroke-width="10" stroke-linecap="round"/><path d="M18 46 46 18M18 18l28 28" stroke="#ffd23a" stroke-width="5" stroke-linecap="round"/></svg>',
  /** The close X: a fat white cross with an ink outline, so it reads on any red. */
  close:
    '<svg class="sp-x" viewBox="0 0 32 32" aria-hidden="true"><g stroke-linecap="round"><path d="M9 9l14 14M23 9 9 23" stroke="#1a0508" stroke-width="9"/>' +
    '<path d="M9 9l14 14M23 9 9 23" stroke="#fff" stroke-width="5"/></g></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7"/></svg>',
  lock:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 28v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#0d0f18" stroke-width="10"/><path d="M20 28v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#c8ccd8" stroke-width="5"/>' +
    '<rect x="12" y="28" width="40" height="30" rx="7" fill="#ffc21e" stroke="#0d0f18" stroke-width="3.5"/><circle cx="32" cy="40" r="5" fill="#0d0f18"/><path d="M32 42v8" stroke="#0d0f18" stroke-width="4"/></svg>',
} as const;

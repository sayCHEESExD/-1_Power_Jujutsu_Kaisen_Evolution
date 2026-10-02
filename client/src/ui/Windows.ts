import {
  AURAS,
  BAG_TIERS,
  CHARACTERS,
  PVP,
  RARITY_NAMES,
  STAGES,
  UPGRADES,
  characterUnlocked,
  formatAmount,
  formatCount,
  formatPlayTime,
  formatWins,
  levelCap,
  levelOf,
  ownsAura,
  rebirthMultiplier,
  upgradeCost,
  upgradeDisplay,
  visibleName,
  type NamedTeleport,
  type UpgradeId,
  type UpgradeLevels,
} from '@jjk/shared';
import type { LeaderboardSnapshot, NetLeaderEntry } from '../net/netTypes.js';
import { ICON } from './icons.js';
import { injectJjkStyles } from './jjkStyles.js';
import type { ModelPortraits } from './ModelPortraits.js';

/**
 * How many windows are open. The input layer polls this to suppress movement
 * while a window owns the screen. A COUNT, so two windows closing in the wrong
 * order can never leave the game stuck.
 */
let openCount = 0;
export const anyWindowOpen = (): boolean => openCount > 0;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (html) node.innerHTML = html;
  return node;
};

const button = (className: string, html: string, onClick: () => void): HTMLButtonElement => {
  const node = el('button', className, html);
  node.type = 'button';
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return node;
};

/**
 * A reference-style window: a coloured, studded header with the icon, the
 * title and a red "Exit", over a light grey studded body.
 */
class Window {
  protected readonly modal: HTMLDivElement;
  protected readonly window: HTMLDivElement;
  protected readonly extra: HTMLSpanElement;
  protected readonly body: HTMLDivElement;
  private open = false;

  constructor(parent: HTMLElement, variant: string, icon: string, title: string, options: { small?: boolean } = {}) {
    injectJjkStyles();
    this.modal = el('div', 'jk-modal jk-hidden');
    this.window = el('div', `jk-win jk-win--${variant}${options.small ? ' jk-win--small' : ''}`);
    const head = el('div', 'jk-win__head');
    head.append(el('div', 'jk-win__icon', icon), el('div', 'jk-win__title jk-font jk-outline', title));
    this.extra = el('span', 'jk-win__extra jk-font jk-outline');
    head.append(this.extra);
    head.append(button('jk-exit jk-font jk-outline', 'Exit', () => this.setOpen(false)));
    this.body = el('div', 'jk-win__body jk-font');
    this.window.append(head, this.body);
    this.modal.append(this.window);
    this.modal.addEventListener('pointerdown', (event) => {
      if (event.target === this.modal) this.setOpen(false);
    });
    parent.appendChild(this.modal);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.modal.classList.toggle('jk-hidden', !open);
    openCount = Math.max(0, openCount + (open ? 1 : -1));
    if (open) {
      this.body.scrollTop = 0;
      this.render();
    }
  }

  protected render(): void {
    /* subclasses */
  }

  dispose(): void {
    this.setOpen(false);
    this.modal.remove();
  }
}

// -------------------------------------------------------------- rebirth

/**
 * THE REBIRTH WINDOW, as the reference: "Rebirth 0 > Rebirth 1", "1x Cursed
 * Energy > 2x Cursed Energy", "Level 10 > Level 20", the level bar (MAX when
 * ready), and the Rebirth button. The server decides.
 */
export class RebirthWindow extends Window {
  private readonly nowHead: HTMLDivElement;
  private readonly nextHead: HTMLDivElement;
  private readonly nowMult: HTMLSpanElement;
  private readonly nextMult: HTMLSpanElement;
  private readonly nowLevel: HTMLSpanElement;
  private readonly nextLevel: HTMLSpanElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly unlocks: HTMLDivElement;
  private readonly action: HTMLButtonElement;
  private eligible = false;
  private fraction = 0;

  constructor(parent: HTMLElement, onRebirth: () => void) {
    super(parent, 'rebirth', ICON.rebirth, 'Rebirth', { small: true });
    const box = el('div', 'jk-rb');
    const grid = el('div', 'jk-rb__grid');
    this.nowHead = el('div', 'jk-rb__head jk-outline');
    this.nextHead = el('div', 'jk-rb__head jk-outline');
    const pill = (kind: string): [HTMLDivElement, HTMLSpanElement] => {
      const node = el('div', `jk-rb__pill jk-rb__pill--${kind} jk-outline`);
      const text = el('span', '');
      node.append(text);
      return [node, text];
    };
    const [nowMultPill, nowMult] = pill('energy');
    const [nextMultPill, nextMult] = pill('energy');
    const [nowLevelPill, nowLevel] = pill('level');
    const [nextLevelPill, nextLevel] = pill('level');
    this.nowMult = nowMult;
    this.nextMult = nextMult;
    this.nowLevel = nowLevel;
    this.nextLevel = nextLevel;
    const arrow = (): HTMLDivElement => el('div', 'jk-rb__arrow jk-outline', '&#9654;');
    grid.append(this.nowHead, el('div', ''), this.nextHead);
    grid.append(nowMultPill, arrow(), nextMultPill);
    grid.append(nowLevelPill, arrow(), nextLevelPill);
    box.append(grid);
    const bar = el('div', 'jk-rb__bar');
    this.fill = el('div', 'jk-rb__fill');
    this.label = el('div', 'jk-rb__barlabel jk-outline');
    bar.append(this.fill, this.label);
    box.append(bar);
    const row = el('div', 'jk-rb__buttons');
    this.action = button('jk-btn jk-btn--purple jk-font jk-outline', 'Rebirth', () => {
      if (!this.eligible) return;
      onRebirth();
      this.setOpen(false);
    });
    row.append(this.action);
    box.append(row);
    this.unlocks = el('div', 'jk-rb__unlocks');
    box.append(this.unlocks);
    box.append(el('div', 'jk-rb__keep', 'Resets Cursed Energy, Level and the walls - you KEEP Wins, sorcerers, auras and upgrades.'));
    this.body.append(box);
    this.setProgress(0, 0);
  }

  get isEligible(): boolean {
    return this.eligible;
  }

  /** 0..1 progress toward the next rebirth, for the tile. */
  get progress(): number {
    return this.fraction;
  }

  setProgress(xp: number, rebirths: number): void {
    const level = levelOf(xp, rebirths);
    const cap = levelCap(rebirths);
    this.eligible = level.maxed;
    this.fraction = Math.min(1, level.level / cap);
    this.nowHead.innerHTML = `Rebirth <b>${formatCount(rebirths)}</b>`;
    this.nextHead.innerHTML = `Rebirth <b>${formatCount(rebirths + 1)}</b>`;
    this.nowMult.textContent = `${formatCount(rebirthMultiplier(rebirths))}x Cursed Energy`;
    this.nextMult.textContent = `${formatCount(rebirthMultiplier(rebirths + 1))}x Cursed Energy`;
    this.nowLevel.textContent = `Level ${formatCount(cap)}`;
    this.nextLevel.textContent = `Level ${formatCount(levelCap(rebirths + 1))}`;
    this.fill.style.width = `${(level.maxed ? 100 : this.fraction * 100).toFixed(1)}%`;
    this.label.textContent = level.maxed ? 'MAX' : `Level ${formatCount(level.level)} / ${formatCount(cap)}`;
    this.action.disabled = !this.eligible;
    this.action.textContent = this.eligible ? 'Rebirth' : `Reach Level ${formatCount(cap)}`;
    const next = rebirths + 1;
    const opens: string[] = [];
    if (next === PVP.rebirthsRequired) opens.push('the PvP Arena');
    for (const tier of BAG_TIERS) if (tier.rebirthsRequired === next) opens.push(`the ${tier.name} (${tier.multiplier}x)`);
    this.unlocks.innerHTML = opens.length > 0 ? `Rebirth ${formatCount(next)} unlocks <b>${opens.join(' and ')}</b>!` : '';
  }
}

// ------------------------------------------------------------- upgrades

const UPGRADE_ICONS: Readonly<Record<UpgradeId, string>> = {
  speed: ICON.shoe,
  trainingRate: ICON.flame,
  luck: ICON.clover,
  bossDamage: ICON.boss,
  punchRate: ICON.lightning,
};

const UPGRADE_NOTES: Readonly<Record<UpgradeId, string>> = {
  speed: 'Run faster',
  trainingRate: 'More Cursed Energy every punch',
  luck: 'More LUCKY punches (3x energy)',
  bossDamage: 'Hit boss walls harder',
  punchRate: 'Punch faster',
};

/**
 * THE UPGRADES, as the reference: a cyan row each - the icon, the name, "25.0
 * >> 27.5", a bar of levels, and on the right the Wins price (green).
 * Every press is a REQUEST the server prices and checks.
 */
export class UpgradesWindow extends Window {
  private wins = 0;
  private levels: UpgradeLevels = { speed: 0, trainingRate: 0, luck: 0, bossDamage: 0, punchRate: 0 };
  private signature = '';

  constructor(
    parent: HTMLElement,
    private readonly onBuy: (id: UpgradeId) => void,
  ) {
    super(parent, 'upgrades', ICON.upgrades, 'Upgrades');
  }

  setState(wins: number, levels: UpgradeLevels): void {
    this.wins = wins;
    this.levels = { ...levels };
    if (this.isOpen && this.key() !== this.signature) this.render();
  }

  private key(): string {
    return `${Math.floor(this.wins)}|${Object.values(this.levels).join(',')}`;
  }

  protected override render(): void {
    this.signature = this.key();
    this.extra.innerHTML = `${ICON.trophy.replace('sp-icon-img', 'sp-icon-img" style="width:1.2em;height:1.2em;vertical-align:-0.25em')} ${formatWins(this.wins)}`;
    this.body.replaceChildren();
    const rows = el('div', 'jk-rows');
    for (const def of UPGRADES) {
      const level = this.levels[def.id];
      const cost = upgradeCost(def.id, level);
      const maxed = !Number.isFinite(cost);
      const shown = upgradeDisplay(def.id, level);
      const row = el('div', 'jk-row');
      row.append(el('div', 'jk-row__icon', UPGRADE_ICONS[def.id]));
      const main = el('div', 'jk-row__main');
      main.append(el('div', 'jk-row__name jk-outline', `${def.name} <small style="opacity:.8;font-size:.55em">Lv ${formatCount(level)}</small>`));
      main.append(
        el('div', 'jk-row__value jk-outline', maxed ? `<span>${shown.now}</span><span class="jk-next">MAX</span>` : `<span>${shown.now}</span><span class="jk-row__arrow">&#9193;</span><span class="jk-next">${shown.next}</span>`),
      );
      const bar = el('div', 'jk-row__bar');
      const fill = el('div', 'jk-row__fill');
      // The bar fills by levels: to the cap where there is one, else by tens.
      const fraction = Number.isFinite(def.max) ? level / def.max : (level % 10) / 10;
      fill.style.width = `${Math.min(100, fraction * 100).toFixed(1)}%`;
      bar.append(fill);
      main.append(bar);
      main.append(el('div', 'jk-note', UPGRADE_NOTES[def.id]));
      row.append(main);
      const side = el('div', 'jk-row__side');
      const buy = button('jk-btn jk-btn--green jk-font jk-outline', maxed ? 'MAXED' : `${ICON.trophy}<span>${formatWins(cost)}</span>`, () => this.onBuy(def.id));
      buy.disabled = maxed || this.wins < cost;
      side.append(buy);
      row.append(side);
      rows.append(row);
    }
    this.body.append(rows);
    this.body.append(el('div', 'jk-note', 'Upgrades are <b>permanent</b>: they stay through every rebirth. Wins come from the Win Areas at the end of each stage.'));
  }
}

// ---------------------------------------------------------------- auras

/**
 * THE AURAS, as the reference: a red row each - the aura's energy swatch, its
 * name, its multiplier, its price in Wins, and Purchase / Equip / Equipped.
 */
export class AurasWindow extends Window {
  private wins = 0;
  private mask = 0;
  private equipped = 0;
  private signature = '';

  constructor(
    parent: HTMLElement,
    private readonly onBuy: (id: number) => void,
    private readonly onEquip: (id: number) => void,
  ) {
    super(parent, 'auras', ICON.auras, 'Auras');
  }

  setState(wins: number, mask: number, equipped: number): void {
    this.wins = wins;
    this.mask = mask;
    this.equipped = equipped;
    if (this.isOpen && this.key() !== this.signature) this.render();
  }

  private key(): string {
    return `${Math.floor(this.wins)}|${this.mask}|${this.equipped}`;
  }

  protected override render(): void {
    this.signature = this.key();
    this.extra.innerHTML = `${ICON.trophy.replace('sp-icon-img', 'sp-icon-img" style="width:1.2em;height:1.2em;vertical-align:-0.25em')} ${formatWins(this.wins)}`;
    this.body.replaceChildren();
    const rows = el('div', 'jk-rows');
    const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
    for (const def of AURAS) {
      const owned = ownsAura(this.mask, def.id);
      const worn = this.equipped === def.id;
      const previous = AURAS[def.id - 2];
      const reachable = owned || !previous || ownsAura(this.mask, previous.id);
      const row = el('div', `jk-row jk-row--aura${worn ? ' jk-row--equipped' : owned ? ' jk-row--owned' : reachable ? '' : ' jk-row--locked'}`);
      const swatch = el('div', 'jk-swatch');
      swatch.style.setProperty('--sa', css(def.accent === 0 ? 0x1a1a1a : def.accent));
      swatch.style.setProperty('--sb', css(def.color));
      row.append(swatch);
      const main = el('div', 'jk-row__main');
      const top = el('div', 'jk-row__line');
      top.append(el('div', 'jk-row__name jk-outline', def.name), el('div', 'jk-row__mult jk-outline', `${formatAmount(def.multiplier)}x ${ICON.flameImg}`));
      main.append(top);
      const bottom = el('div', 'jk-row__line');
      bottom.append(el('div', 'jk-row__cost jk-outline', owned ? 'Owned' : `${ICON.trophy}<span>${formatWins(def.cost)}</span>`));
      main.append(bottom);
      row.append(main);
      const side = el('div', 'jk-row__side');
      if (worn) {
        side.append(button('jk-btn jk-btn--blue jk-font jk-outline', 'Unequip', () => this.onEquip(0)));
      } else if (owned) {
        side.append(button('jk-btn jk-btn--green jk-font jk-outline', 'Equip', () => this.onEquip(def.id)));
      } else {
        const buy = button('jk-btn jk-btn--gold jk-font jk-outline', 'Purchase', () => this.onBuy(def.id));
        buy.disabled = this.wins < def.cost;
        side.append(buy);
      }
      row.append(side);
      rows.append(row);
    }
    this.body.append(rows);
    this.body.append(el('div', 'jk-note', 'An aura is bought once and kept forever. The equipped one <b>multiplies every punch</b> - and burns round you for everyone to see.'));
  }
}

// ----------------------------------------------------------- characters

/**
 * THE SORCERERS: all twelve as cards - the real model, its name, rarity,
 * "+N/Click", and Equip / Equipped, or the Wins it still needs. Over them the
 * LOOK toggle: wear the character, or your own avatar with its power.
 */
export class CharactersWindow extends Window {
  private lifetime = 0;
  private equipped = 1;
  private morph = false;
  private signature = '';

  constructor(
    parent: HTMLElement,
    private readonly portraits: ModelPortraits,
    private readonly onEquip: (id: number) => void,
    private readonly onMorph: (morph: boolean) => void,
  ) {
    super(parent, 'characters', ICON.characters, 'Sorcerers');
  }

  setState(lifetimeWins: number, equipped: number, morph: boolean): void {
    this.lifetime = lifetimeWins;
    this.equipped = equipped;
    this.morph = morph;
    if (this.isOpen && this.key() !== this.signature) this.render();
  }

  private key(): string {
    return `${CHARACTERS.filter((c) => characterUnlocked(c.id, this.lifetime)).length}|${this.equipped}|${this.morph ? 1 : 0}|${Math.floor(this.lifetime)}`;
  }

  protected override render(): void {
    this.signature = this.key();
    const unlocked = CHARACTERS.filter((c) => characterUnlocked(c.id, this.lifetime)).length;
    this.extra.textContent = `${unlocked}/${CHARACTERS.length}`;
    this.body.replaceChildren();
    const look = el('div', 'jk-look');
    const avatar = button(`jk-btn ${this.morph ? 'jk-btn--blue' : 'jk-btn--green'} jk-font jk-outline`, this.morph ? 'Wear My Avatar' : 'Wearing My Avatar', () => this.onMorph(false));
    avatar.disabled = !this.morph;
    const character = button(`jk-btn ${this.morph ? 'jk-btn--green' : 'jk-btn--purple'} jk-font jk-outline`, this.morph ? 'Wearing Sorcerer' : 'Wear Sorcerer', () => this.onMorph(true));
    character.disabled = this.morph;
    look.append(avatar, character);
    this.body.append(look);
    const grid = el('div', 'jk-cgrid');
    for (const def of CHARACTERS) {
      const open = characterUnlocked(def.id, this.lifetime);
      const worn = this.equipped === def.id;
      const card = el('div', `jk-card jk-rarity-${def.rarity}${open ? '' : ' jk-card--locked'}${worn ? ' jk-card--worn' : ''}`);
      const img = el('img', 'jk-card__img');
      img.src = this.portraits.character(def.id);
      img.alt = def.name;
      card.append(img);
      card.append(el('div', 'jk-card__name jk-outline', def.name));
      card.append(el('div', 'jk-card__power jk-outline', `+${formatAmount(def.power)}/Click`));
      card.append(el('div', 'jk-card__req jk-outline', open ? RARITY_NAMES[def.rarity] : def.winsRequired === 0 ? 'FREE' : `${ICON.trophy}<span>${formatWins(def.winsRequired)} Wins</span>`));
      const action = worn
        ? button('jk-btn jk-btn--blue jk-font jk-outline', 'Equipped', () => undefined)
        : open
          ? button('jk-btn jk-btn--green jk-font jk-outline', 'Equip', () => this.onEquip(def.id))
          : button('jk-btn jk-font jk-outline', `${ICON.lock}Locked`, () => undefined);
      action.disabled = worn || !open;
      card.append(action);
      grid.append(card);
    }
    this.body.append(grid);
    const next = CHARACTERS.find((def) => !characterUnlocked(def.id, this.lifetime));
    this.body.append(
      el(
        'div',
        'jk-note',
        next
          ? `Sorcerers unlock with the Wins you have <b>earned in all</b> - spending Wins never locks one again. Next: <b>${next.name}</b> at ${formatWins(next.winsRequired)} (${formatWins(Math.max(0, next.winsRequired - this.lifetime))} to go).`
          : 'Every sorcerer unlocked. You are the strongest!',
      ),
    );
  }
}

// ---------------------------------------------------------------- worlds

const PLACES: readonly (readonly [NamedTeleport, string])[] = [
  ['spawn', 'Spawn (new run)'],
  ['characters', 'Sorcerers'],
  ['training', 'Training Zone'],
  ['pvp', 'PvP Arena'],
];

/**
 * WORLDS: the hall's places, and every stage with its levels, boss and Wins.
 * A stage is open up to one past the best stage ever completed; the server
 * re-checks. Teleporting to a stage starts a run there.
 */
export class WorldsWindow extends Window {
  private bestStage = 0;

  constructor(parent: HTMLElement, private readonly onTeleport: (to: string) => void) {
    super(parent, 'worlds', ICON.worlds, 'Worlds');
  }

  setState(bestStage: number): void {
    const changed = bestStage !== this.bestStage;
    this.bestStage = bestStage;
    if (changed && this.isOpen) this.render();
  }

  protected override render(): void {
    this.extra.textContent = `Best: Stage ${this.bestStage}/${STAGES.length}`;
    this.body.replaceChildren();
    const places = el('div', 'jk-places');
    for (const [id, name] of PLACES) {
      places.append(
        button('jk-btn jk-btn--blue jk-font jk-outline', name, () => {
          this.onTeleport(id);
          this.setOpen(false);
        }),
      );
    }
    this.body.append(places);
    const rows = el('div', 'jk-rows');
    let focus: HTMLElement | null = null;
    for (const stage of STAGES) {
      const open = stage.index <= this.bestStage + 1;
      const cleared = stage.index <= this.bestStage;
      const row = el('div', `jk-row jk-world${cleared ? ' jk-world--cleared' : open ? '' : ' jk-world--locked'}`);
      row.append(el('div', 'jk-world__num jk-outline', String(stage.index)));
      const main = el('div', 'jk-world__main');
      main.append(el('div', 'jk-world__name jk-outline', stage.name));
      const first = stage.firstWall + 1;
      main.append(el('div', 'jk-world__meta jk-outline', `Levels ${first}-${first + stage.wallCount - 1}  -  Boss ${formatAmount(stage.bossHp)} HP  -  <b>+${formatWins(stage.reward)} Wins</b>`));
      row.append(main);
      const go = button(`jk-btn ${open ? 'jk-btn--green' : ''} jk-font jk-outline`, open ? 'Teleport' : `${ICON.lock}`, () => {
        this.onTeleport(`stage${stage.index}`);
        this.setOpen(false);
      });
      go.disabled = !open;
      row.append(go);
      rows.append(row);
      if (stage.index === this.bestStage + 1) focus = row;
    }
    this.body.append(rows);
    if (focus) {
      const target = focus;
      requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
    }
  }
}

// ---------------------------------------------------------------- boards

const BOARD_TABS = [
  { key: 'energy', title: 'Top Cursed Energy', color: '#c88aff', format: formatAmount },
  { key: 'rebirths', title: 'Top Rebirths', color: '#ff7ae8', format: formatCount },
  { key: 'wins', title: 'Top Wins', color: '#ffe23a', format: formatWins },
  { key: 'playtime', title: 'Top Playtime', color: '#5ad8ff', format: formatPlayTime },
] as const;

/** THE GLOBAL BOARDS, in a window: the same four the back wall shows, readable from anywhere. */
export class BoardsWindow extends Window {
  private board: LeaderboardSnapshot | null = null;
  private signature = '';

  constructor(parent: HTMLElement) {
    super(parent, 'boards', ICON.boards, 'Leaderboards');
  }

  setBoard(board: LeaderboardSnapshot | null): void {
    this.board = board;
    if (!this.isOpen) return;
    const signature = JSON.stringify(board);
    if (signature !== this.signature) this.render();
  }

  protected override render(): void {
    this.signature = JSON.stringify(this.board);
    this.body.replaceChildren();
    const columns = el('div', 'jk-boards');
    for (const tab of BOARD_TABS) {
      const column = el('div', 'jk-board');
      const head = el('div', 'jk-board__head jk-outline', tab.title);
      head.style.color = tab.color;
      column.append(head);
      const rows: readonly NetLeaderEntry[] = this.board?.[tab.key] ?? [];
      let shown = 0;
      rows.forEach((row, index) => {
        if (!row.handle || row.value <= 0) return;
        shown += 1;
        const line = el('div', 'jk-board__row jk-outline');
        line.append(el('span', 'jk-board__rank', `#${index + 1}`), el('span', 'jk-board__name', visibleName(row.name)), el('span', 'jk-board__value', tab.format(row.value)));
        column.append(line);
      });
      if (shown === 0) column.append(el('div', 'jk-note', 'No one yet - be the first!'));
      columns.append(column);
    }
    this.body.append(columns);
  }
}

import { formatAmount, formatCount, formatPrecise, formatWins } from '@jjk/shared';
import { ICON } from './icons.js';
import { injectJjkStyles } from './jjkStyles.js';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (html) node.innerHTML = html;
  return node;
};

/** One studded square tile with its name on it, as the reference's left grid. */
export class HudButton {
  readonly root: HTMLButtonElement;
  private readonly pct: HTMLSpanElement;

  constructor(parent: HTMLElement, label: string, icon: string, hotkey: string | null, variant: string, onClick: () => void) {
    this.root = el('button', `jk-tile jk-tile--${variant}`);
    this.root.type = 'button';
    this.root.setAttribute('aria-label', hotkey ? `${label} (${hotkey})` : label);
    this.root.append(el('span', 'jk-tile__icon', icon));
    this.root.append(el('span', 'jk-tile__label jk-font jk-outline', label));
    if (hotkey) this.root.append(el('span', 'jk-tile__key jk-font', hotkey));
    this.root.append(el('span', 'jk-tile__badge jk-font', '!'));
    this.pct = el('span', 'jk-tile__pct jk-font jk-outline');
    this.root.append(this.pct);
    this.root.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    parent.appendChild(this.root);
  }

  setReady(ready: boolean): void {
    this.root.classList.toggle('jk-tile--ready', ready);
  }

  setPercent(text: string): void {
    if (this.pct.textContent !== text) this.pct.textContent = text;
  }

  setOff(off: boolean): void {
    this.root.classList.toggle('jk-tile--off', off);
  }

  press(): void {
    this.root.click();
  }
}

export interface StatusView {
  readonly level: number;
  /** 0..1 of the current level. */
  readonly fraction: number;
  readonly into: number;
  readonly need: number;
  /** The rebirth's cap is reached: the bar reads MAX. */
  readonly maxed: boolean;
  readonly energy: number;
  readonly wins: number;
  readonly gainPerPunch: number;
  /** Everything a punch is multiplied by besides the character. */
  readonly multiplier: number;
  readonly characterName: string;
  readonly characterPower: number;
}

/** The bag chip: what the bag in front of the player pays, or why only 1x. */
export interface BagView {
  readonly name: string;
  readonly multiplier: number;
  readonly color: string;
  readonly locked: string;
}

/** The top panel: a wall's health in the corridor, the player's own in the arena. */
export interface PanelView {
  readonly kind: 'stage' | 'boss' | 'pvp';
  /** HTML. */
  readonly title: string;
  readonly value: number;
  readonly max: number;
  readonly barText: string;
  /** HTML. */
  readonly meta: string;
  /** The bar is on the wall itself: show only the title and the line under it. */
  readonly compact?: boolean;
}

const multiplierText = (value: number): string => {
  if (value >= 10_000) return `${formatAmount(value)}x`;
  if (value >= 100) return `${Math.floor(value)}x`;
  // Two places under ten (1.05x), one under a hundred (27.5x): every upgrade visibly moves it.
  const text = value < 10 ? value.toFixed(2) : value.toFixed(1);
  return `${text.replace(/\.?0+$/, '')}x`;
};

/**
 * THE HUD, laid out as the reference screenshots:
 *
 *   top left        the trophy and the Wins, then the 2x3 tile grid
 *   top right       Music, Boards and Invite tiles
 *   top centre      the quest banner; under it the wall's health in the
 *                   corridor, or health in the arena
 *   bottom centre   "Rebirth needed to level up!", the character and bag chips,
 *                   "2.8x Energy" and "15.4K Cursed Energy", then the rainbow
 *                   "+N" square beside the purple LEVEL bar
 *   bottom right    the rainbow OP Auto Clicker
 *
 * Presentation only: every figure is replicated server state.
 */
export class Hud {
  readonly left: HTMLDivElement;
  readonly grid: HTMLDivElement;
  readonly corner: HTMLDivElement;
  private readonly root: HTMLElement;
  private readonly nodes: HTMLElement[] = [];
  private readonly winsBox: HTMLDivElement;
  private readonly wins: HTMLDivElement;
  private readonly warn: HTMLDivElement;
  private readonly characterChip: HTMLDivElement;
  private readonly bagChip: HTMLDivElement;
  private readonly mult: HTMLDivElement;
  private readonly energy: HTMLDivElement;
  private readonly plus: HTMLDivElement;
  private readonly level: HTMLDivElement;
  private readonly levelFill: HTMLDivElement;
  private readonly levelName: HTMLDivElement;
  private readonly levelValue: HTMLDivElement;
  private readonly auto: HTMLButtonElement;
  private readonly autoState: HTMLSpanElement;
  private readonly quest: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly panelTitle: HTMLDivElement;
  private readonly panelFill: HTMLDivElement;
  private readonly panelText: HTMLDivElement;
  private readonly panelMeta: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly pops: HTMLDivElement;
  private lastEnergy = -1;
  private lastWins = -1;
  private popTimer = 0;
  private hintText = '';
  private questText = '';
  private panelSignature = '';
  private chipSignature = '';
  private lastToast = '';
  private lastToastAt = 0;

  constructor(parent: HTMLElement, onAutoClick: () => void) {
    injectJjkStyles();
    this.root = parent;
    this.left = this.add(el('div', 'jk-left'));
    this.winsBox = el('div', 'jk-wins jk-font');
    this.winsBox.append(el('div', 'jk-wins__icon', ICON.trophy));
    this.wins = el('div', 'jk-wins__value jk-outline', '0');
    this.winsBox.append(this.wins);
    this.left.append(this.winsBox);
    this.grid = el('div', 'jk-grid');
    this.left.append(this.grid);
    this.corner = this.add(el('div', 'jk-corner'));

    const bottom = this.add(el('div', 'jk-bottom jk-font'));
    this.warn = el('div', 'jk-warn jk-outline jk-hidden', 'Rebirth needed to level up!');
    const chips = el('div', 'jk-chips');
    this.characterChip = el('div', 'jk-chip jk-outline');
    this.bagChip = el('div', 'jk-chip jk-outline jk-hidden');
    chips.append(this.characterChip, this.bagChip);
    const line = el('div', 'jk-energyline');
    this.mult = el('div', 'jk-mult jk-outline', '1x Energy');
    this.energy = el('div', 'jk-energy jk-outline', '0 Cursed Energy');
    line.append(this.mult, this.energy, el('div', ''));
    const bar = el('div', 'jk-barrow');
    this.plus = el('div', 'jk-plus jk-outline', '+1');
    this.level = el('div', 'jk-level');
    this.levelFill = el('div', 'jk-level__fill');
    this.levelName = el('div', 'jk-level__name jk-outline', 'Level 1');
    this.levelValue = el('div', 'jk-level__value jk-outline', '0/0');
    this.level.append(this.levelFill, this.levelName, this.levelValue);
    bar.append(this.plus, this.level);
    bottom.append(this.warn, chips, line, bar);

    this.auto = this.add(el('button', 'jk-auto jk-font'));
    this.auto.type = 'button';
    this.auto.append(el('span', 'jk-auto__label jk-outline', 'OP Auto Clicker'));
    this.autoState = el('span', 'jk-auto__state jk-outline', 'OFF');
    this.auto.append(this.autoState);
    this.auto.append(el('span', 'jk-auto__op jk-outline', 'OP!'));
    this.auto.setAttribute('aria-label', 'Auto clicker (C)');
    this.auto.addEventListener('click', (event) => {
      event.stopPropagation();
      onAutoClick();
    });

    this.quest = this.add(el('div', 'jk-quest jk-font jk-outline jk-hidden'));
    this.panel = this.add(el('div', 'jk-panel jk-font jk-hidden'));
    this.panelTitle = el('div', 'jk-panel__title jk-outline');
    const panelBar = el('div', 'jk-panel__bar');
    this.panelFill = el('div', 'jk-panel__fill');
    this.panelText = el('div', 'jk-panel__text jk-outline');
    panelBar.append(this.panelFill, this.panelText);
    this.panelMeta = el('div', 'jk-panel__meta jk-outline');
    this.panel.append(this.panelTitle, panelBar, this.panelMeta);

    this.hint = this.add(el('div', 'sp-hint sp-font sp-outline sp-hidden'));
    this.toasts = this.add(el('div', 'sp-toasts sp-font'));
    this.pops = this.add(el('div', 'sp-pops sp-font'));
  }

  private add<T extends HTMLElement>(node: T): T {
    this.root.appendChild(node);
    this.nodes.push(node);
    return node;
  }

  setStatus(view: StatusView): void {
    this.energy.innerHTML = `${ICON.flameImg}${formatPrecise(view.energy)} Cursed Energy`;
    if (this.lastEnergy >= 0 && view.energy > this.lastEnergy) {
      this.energy.classList.remove('jk-energy--pop');
      void this.energy.offsetWidth;
      this.energy.classList.add('jk-energy--pop');
      window.clearTimeout(this.popTimer);
      this.popTimer = window.setTimeout(() => this.energy.classList.remove('jk-energy--pop'), 140);
    }
    this.lastEnergy = view.energy;
    this.levelName.textContent = `Level ${formatCount(view.level)}`;
    this.levelValue.textContent = view.maxed ? 'MAX' : `${formatAmount(view.into)}/${formatAmount(view.need)}`;
    this.levelFill.style.width = `${(view.maxed ? 100 : view.fraction * 100).toFixed(1)}%`;
    this.level.classList.toggle('jk-level--max', view.maxed);
    this.warn.classList.toggle('jk-hidden', !view.maxed);
    this.plus.textContent = `+${formatAmount(view.gainPerPunch)}`;
    this.mult.textContent = `${multiplierText(view.multiplier)} Energy`;
    if (this.lastWins >= 0 && view.wins > this.lastWins) {
      this.winsBox.classList.remove('jk-wins--pop');
      void this.winsBox.offsetWidth;
      this.winsBox.classList.add('jk-wins--pop');
    }
    this.lastWins = view.wins;
    this.wins.textContent = formatWins(view.wins);
    const chip = `${view.characterName}|${view.characterPower}`;
    if (chip !== this.chipSignature) {
      this.chipSignature = chip;
      this.characterChip.innerHTML = `${ICON.characters}<span>${view.characterName}: +${formatAmount(view.characterPower)}/Click</span>`;
    }
  }

  setBag(view: BagView | null): void {
    this.bagChip.classList.toggle('jk-hidden', !view);
    if (!view) return;
    this.bagChip.classList.toggle('jk-chip--locked', view.locked.length > 0);
    this.bagChip.style.setProperty('--chip', view.color);
    const text = view.locked ? `${view.name}: ${view.locked}` : `${view.name}: ${view.multiplier}x Energy`;
    if (this.bagChip.textContent !== text) this.bagChip.textContent = text;
  }

  setAutoClick(on: boolean): void {
    this.auto.classList.toggle('jk-auto--on', on);
    this.autoState.textContent = on ? 'ON' : 'OFF';
  }

  /** The quest banner ("Stage (3/3): Unlock Nobara"), or '' to hide it. HTML. */
  setQuest(html: string): void {
    if (html === this.questText) return;
    const advanced = this.questText !== '' && html !== '';
    this.questText = html;
    this.quest.innerHTML = html;
    this.quest.classList.toggle('jk-hidden', html.length === 0);
    if (advanced) {
      this.quest.classList.remove('jk-quest--done');
      void this.quest.offsetWidth;
      this.quest.classList.add('jk-quest--done');
    }
  }

  /** The top panel, or null to hide it. */
  setPanel(view: PanelView | null): void {
    this.panel.classList.toggle('jk-hidden', !view);
    if (!view) return;
    this.panel.classList.toggle('jk-panel--pvp', view.kind === 'pvp');
    this.panel.classList.toggle('jk-panel--boss', view.kind === 'boss');
    this.panel.classList.toggle('jk-panel--compact', view.compact === true);
    const signature = `${view.title}|${view.meta}|${view.barText}`;
    if (signature !== this.panelSignature) {
      this.panelSignature = signature;
      this.panelTitle.innerHTML = view.title;
      this.panelMeta.innerHTML = view.meta;
      this.panelText.textContent = view.barText;
    }
    const fraction = view.max > 0 ? Math.min(1, Math.max(0, view.value / view.max)) : 0;
    this.panelFill.style.width = `${(fraction * 100).toFixed(1)}%`;
  }

  setHint(text: string): void {
    if (text === this.hintText) return;
    this.hintText = text;
    this.hint.textContent = text;
    this.hint.classList.toggle('sp-hidden', text.length === 0);
  }

  toast(text: string, tone: 'good' | 'bad' | 'gold' | 'pink' = 'good'): void {
    const now = performance.now();
    if (text === this.lastToast && now - this.lastToastAt < 1500) return;
    this.lastToast = text;
    this.lastToastAt = now;
    const toast = el('div', `sp-toast sp-toast--${tone} sp-outline`);
    toast.textContent = text;
    this.toasts.appendChild(toast);
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => toast.remove(), 2450);
  }

  /**
   * A floating "+N" at a screen point (or scattered round the centre), with
   * the cursed-energy flame. `extra` is a second, coloured part - the bag's
   * multiplier, or LUCKY.
   */
  pop(text: string, kind: 'train' | 'lucky' | 'dmg' | 'kill', x?: number, y?: number, extra?: { text: string; color: string }): void {
    if (this.pops.childElementCount > 16) this.pops.firstElementChild?.remove();
    const node = el('div', `sp-pop jk-pop ${kind === 'train' ? 'jk-pop--train' : kind === 'lucky' ? 'jk-pop--lucky' : `sp-pop--${kind}`} sp-outline`);
    if (kind === 'train' || kind === 'lucky') node.innerHTML = ICON.flameImg;
    node.append(text);
    if (extra) {
      const tag = el('span', 'jk-pop__mult');
      tag.textContent = extra.text;
      tag.style.color = extra.color;
      node.append(tag);
    }
    const px = x ?? window.innerWidth * (0.5 + (Math.random() - 0.5) * 0.24);
    const py = y ?? window.innerHeight * (0.52 + (Math.random() - 0.5) * 0.12);
    node.style.left = `${px}px`;
    node.style.top = `${py}px`;
    this.pops.appendChild(node);
    window.setTimeout(() => node.remove(), 900);
  }

  /** The LEVEL UP! banner of the reference. */
  levelUp(from: number, to: number): void {
    const node = el('div', 'sp-levelup sp-font');
    node.innerHTML = `<div class="sp-levelup__title sp-outline">${ICON.burst}<span>LEVEL UP!</span>${ICON.burst}</div>`;
    const line = el('div', 'sp-levelup__line sp-outline');
    line.textContent = `Level ${formatCount(from)} > Level ${formatCount(to)}`;
    node.append(line);
    this.root.appendChild(node);
    window.setTimeout(() => node.remove(), 2400);
  }

  /** A big banner in a colour: NEW SORCERER!, STAGE CLEARED!, REBIRTH! */
  banner(title: string, line: string, color: string): void {
    const node = el('div', 'sp-levelup sp-levelup--evolve sp-font');
    node.innerHTML = `<div class="sp-levelup__title sp-outline">${ICON.burst}<span>${title}</span>${ICON.burst}</div>`;
    const sub = el('div', 'sp-levelup__line sp-outline');
    sub.textContent = line;
    sub.style.color = color;
    node.append(sub);
    this.root.appendChild(node);
    window.setTimeout(() => node.remove(), 3000);
  }

  dispose(): void {
    window.clearTimeout(this.popTimer);
    for (const node of this.nodes) node.remove();
  }
}

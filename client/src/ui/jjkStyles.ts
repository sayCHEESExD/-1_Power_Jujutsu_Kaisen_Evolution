import { injectMuscleStyles } from './muscleStyles.js';

let injected = false;

/**
 * THE JUJUTSU HUD'S STYLESHEET - the reference screenshots, rebuilt:
 *
 *   - top left, the trophy and the Wins; under it a 2x3 grid of studded
 *     square tiles in saturated colours (Rebirth, Shop, Upgrades, Characters,
 *     Worlds, Auras), each a supplied icon with its name in outlined type;
 *   - bottom centre, "Rebirth needed to level up!" in red when capped, the
 *     gold "2.8x Energy", the violet "15.4K Cursed Energy", then the rainbow
 *     "+1" square beside the studded purple LEVEL bar ("Level 10 ... MAX");
 *   - bottom right, the rainbow "OP Auto Clicker";
 *   - top centre, the quest banner ("Stage (3/3): Unlock Nobara");
 *   - windows with a coloured, studded header (icon, title, a red "Exit"),
 *     over a light grey studded body holding white or tinted rows with a dark
 *     rim - Rebirth orange, Upgrades cyan, Auras red, Characters violet.
 *
 * Everything is sized by the one HUD unit `--u` (`hudStyles`), with px floors
 * on type so a phone stays readable.
 *
 * NO BACKTICKS IN THE CSS: it is a template literal.
 */
export const injectJjkStyles = (): void => {
  if (injected) return;
  injected = true;
  injectMuscleStyles();
  const style = document.createElement('style');
  style.textContent = `
:root {
  --jk-ink: #12141f;
  --jk-font: "Fredoka", "Baloo 2", "Nunito", "Segoe UI", system-ui, sans-serif;
  --jk-tile: calc(108 * var(--u));
  --jk-rainbow: linear-gradient(90deg, #ff3a5a, #ff9a2a, #ffe23a, #4aff6a, #3ad8ff, #9a5aff, #ff4ad8);
  --jk-studs: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.26) 0 22%, rgba(0,0,0,0.14) 26% 34%, transparent 38%);
}
.jk-font { font-family: var(--jk-font); font-weight: 700; letter-spacing: 0.01em; }
.jk-outline {
  color: #fff;
  text-shadow:
    2px 0 0 var(--jk-ink), -2px 0 0 var(--jk-ink), 0 2px 0 var(--jk-ink), 0 -2px 0 var(--jk-ink),
    2px 2px 0 var(--jk-ink), -2px 2px 0 var(--jk-ink), 2px -2px 0 var(--jk-ink), -2px -2px 0 var(--jk-ink),
    0 3px 5px rgba(0, 0, 0, 0.35);
}
.jk-hidden { display: none !important; }

/* ---- Top left: the Wins, then the tile grid ---- */
.jk-left {
  position: fixed;
  left: max(8px, calc(16 * var(--u)), env(safe-area-inset-left, 0px));
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: calc(10 * var(--u));
  z-index: 21;
  user-select: none;
}
.jk-wins { display: flex; align-items: center; gap: calc(6 * var(--u)); }
.jk-wins__icon { width: calc(70 * var(--u)); height: calc(70 * var(--u)); min-width: 28px; min-height: 28px; display: grid; place-items: center; }
.jk-wins__icon img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.4)); }
.jk-wins__value { font-size: max(20px, calc(58 * var(--u))); line-height: 1; }
.jk-wins--pop .jk-wins__value { animation: jk-pop 420ms ease-out; }
.jk-grid { display: grid; grid-template-columns: repeat(2, var(--jk-tile)); gap: calc(10 * var(--u)); }
.jk-tile {
  position: relative;
  width: var(--jk-tile);
  height: var(--jk-tile);
  min-width: 46px;
  min-height: 46px;
  padding: 0;
  border: max(2px, calc(4 * var(--u))) solid var(--jk-ink);
  border-radius: calc(14 * var(--u));
  background: linear-gradient(180deg, var(--ta, #ff6a5a), var(--tb, #c8203a));
  box-shadow: inset 0 0 0 max(2px, calc(3 * var(--u))) rgba(255, 255, 255, 0.28), 0 calc(6 * var(--u)) 0 rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 110ms ease;
  overflow: visible;
}
.jk-tile::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: var(--jk-studs);
  background-size: calc(27 * var(--u)) calc(27 * var(--u));
  opacity: 0.7;
  pointer-events: none;
}
.jk-tile:hover { transform: scale(1.06); }
.jk-tile:active { transform: translateY(calc(3 * var(--u))) scale(0.97); }
.jk-tile__icon { position: absolute; inset: 6% 12% 22%; display: grid; place-items: center; }
.jk-tile__icon img, .jk-tile__icon svg { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 calc(4 * var(--u)) calc(2 * var(--u)) rgba(0, 0, 0, 0.45)); }
.jk-tile__label { position: absolute; left: 50%; bottom: calc(2 * var(--u)); transform: translateX(-50%); font-size: max(9px, calc(24 * var(--u))); letter-spacing: -0.02em; line-height: 1; white-space: nowrap; pointer-events: none; }
.jk-tile__key { position: absolute; left: calc(5 * var(--u)); top: calc(3 * var(--u)); font-size: max(9px, calc(16 * var(--u))); color: rgba(255,255,255,0.85); pointer-events: none; }
body.aoe-touch-mode .jk-tile__key { display: none; }
.jk-tile__badge {
  display: none;
  position: absolute;
  right: calc(-8 * var(--u));
  top: calc(-8 * var(--u));
  width: max(18px, calc(32 * var(--u)));
  height: max(18px, calc(32 * var(--u)));
  border-radius: 50%;
  background: #ff2a3a;
  border: max(2px, calc(3 * var(--u))) solid #fff;
  color: #fff;
  font-size: max(11px, calc(20 * var(--u)));
  place-items: center;
  animation: jk-bounce 1.2s ease-in-out infinite;
}
.jk-tile--ready .jk-tile__badge { display: grid; }
.jk-tile__pct { position: absolute; right: calc(4 * var(--u)); top: calc(4 * var(--u)); font-size: max(9px, calc(18 * var(--u))); color: #ffe27a; pointer-events: none; }
.jk-tile--rebirth { --ta: #ff7a6a; --tb: #e0283a; }
.jk-tile--upgrades { --ta: #ffe85a; --tb: #ffa21a; }
.jk-tile--characters { --ta: #d87aff; --tb: #8a2ae0; }
.jk-tile--worlds { --ta: #a88aff; --tb: #5a3ad8; }
.jk-tile--auras { --ta: #ff7a4a; --tb: #d01a1a; }
.jk-tile--boards { --ta: #ffe23a; --tb: #e8901a; }
.jk-tile--invite { --ta: #5ad8ff; --tb: #1a7ae0; }
.jk-tile--music { --ta: #7dff6a; --tb: #2fae2b; }
.jk-tile--off { filter: saturate(0.25) brightness(0.75); }

/* ---- Top right: the small tiles ---- */
.jk-corner {
  position: fixed;
  right: max(8px, calc(16 * var(--u)), env(safe-area-inset-right, 0px));
  top: max(64px, calc(118 * var(--u)), env(safe-area-inset-top, 0px));
  display: flex;
  flex-direction: column;
  gap: calc(14 * var(--u));
  z-index: 21;
}
.jk-corner .jk-tile { --jk-tile: calc(74 * var(--u)); min-width: 38px; min-height: 38px; }
.jk-corner .jk-tile__label { font-size: max(9px, calc(17 * var(--u))); }

/* ---- Bottom centre: warning, multiplier, Cursed Energy, the +N square and the level bar ---- */
.jk-bottom {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + max(8px, calc(18 * var(--u))));
  transform: translateX(-50%);
  width: min(74vw, calc(860 * var(--u)));
  min-width: 260px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: calc(2 * var(--u));
  z-index: 20;
  pointer-events: none;
}
.jk-warn { text-align: center; color: #ff2a3a; font-size: max(13px, calc(34 * var(--u))); line-height: 1.1; }
.jk-chips { display: flex; justify-content: center; gap: calc(10 * var(--u)); flex-wrap: wrap; margin-bottom: calc(2 * var(--u)); }
.jk-chip {
  display: inline-flex;
  align-items: center;
  gap: calc(6 * var(--u));
  padding: calc(3 * var(--u)) calc(14 * var(--u));
  border-radius: 999px;
  border: max(2px, calc(3 * var(--u))) solid var(--chip, #8a5aff);
  background: rgba(14, 10, 30, 0.62);
  font-size: max(11px, calc(22 * var(--u)));
  white-space: nowrap;
}
.jk-chip img, .jk-chip svg { width: calc(30 * var(--u)); height: calc(30 * var(--u)); min-width: 16px; min-height: 16px; object-fit: contain; }
.jk-chip--locked { --chip: #ff4a5a; color: #ffb8c0; }
.jk-energyline { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; }
.jk-mult { color: #ffd23a; font-size: max(12px, calc(30 * var(--u))); line-height: 1; padding-left: calc(84 * var(--u)); white-space: nowrap; }
.jk-energy { color: #b98aff; font-size: max(18px, calc(50 * var(--u))); line-height: 1; white-space: nowrap; transition: transform 90ms ease; }
.jk-energy--pop { transform: scale(1.1); }
.jk-energy img { height: 0.9em; vertical-align: -0.1em; margin-right: calc(4 * var(--u)); }
.jk-barrow { display: flex; align-items: stretch; gap: calc(10 * var(--u)); margin-top: calc(4 * var(--u)); }
.jk-plus {
  flex: 0 0 auto;
  min-width: calc(78 * var(--u));
  padding: 0 calc(8 * var(--u));
  height: calc(78 * var(--u));
  min-height: 34px;
  border: max(2px, calc(5 * var(--u))) solid var(--jk-ink);
  border-radius: calc(12 * var(--u));
  background: linear-gradient(135deg, #ff4a5a, #ffb02a, #fff23a, #5aff6a, #3ad8ff, #9a5aff);
  display: grid;
  place-items: center;
  font-size: max(14px, calc(38 * var(--u)));
  white-space: nowrap;
}
.jk-level {
  position: relative;
  flex: 1 1 auto;
  height: calc(78 * var(--u));
  min-height: 34px;
  border: max(2px, calc(5 * var(--u))) solid var(--jk-ink);
  border-radius: calc(12 * var(--u));
  background: #2a0a4a;
  overflow: hidden;
}
.jk-level__fill { position: absolute; inset: 0 auto 0 0; width: 0%; background: linear-gradient(180deg, #e070ff, #9a2aff 55%, #6a10c8); transition: width 160ms ease-out; }
.jk-level::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: var(--jk-studs);
  background-size: calc(30 * var(--u)) calc(30 * var(--u));
  opacity: 0.55;
  z-index: 1;
  pointer-events: none;
}
.jk-level--max .jk-level__fill { background: linear-gradient(90deg, #6a10c8, #d050ff, #6a10c8); background-size: 200% 100%; animation: jk-maxflow 2.4s linear infinite; }
.jk-level__name, .jk-level__value { position: absolute; top: 50%; transform: translateY(-50%); font-size: max(15px, calc(42 * var(--u))); line-height: 1; white-space: nowrap; z-index: 2; }
.jk-level__name { left: calc(18 * var(--u)); }
.jk-level__value { right: calc(18 * var(--u)); }

/* ---- Bottom right: the rainbow OP Auto Clicker ---- */
.jk-auto {
  position: fixed;
  right: max(10px, calc(22 * var(--u)), env(safe-area-inset-right, 0px));
  bottom: calc(env(safe-area-inset-bottom, 0px) + max(10px, calc(24 * var(--u))));
  width: calc(250 * var(--u));
  min-width: 118px;
  height: calc(80 * var(--u));
  min-height: 38px;
  border: max(3px, calc(5 * var(--u))) solid var(--jk-ink);
  border-radius: calc(12 * var(--u));
  background: var(--jk-rainbow);
  background-size: 200% 100%;
  box-shadow: 0 calc(5 * var(--u)) 0 rgba(0, 0, 0, 0.3);
  cursor: pointer;
  z-index: 21;
  display: grid;
  place-items: center;
  padding: 0;
  transition: transform 110ms ease, filter 160ms ease;
}
.jk-auto::after {
  content: '';
  position: absolute;
  inset: calc(6 * var(--u));
  border-radius: calc(6 * var(--u));
  background: rgba(20, 30, 60, 0.82);
  z-index: 0;
}
.jk-auto:hover { transform: scale(1.04); }
.jk-auto__label { position: relative; z-index: 1; font-size: max(12px, calc(30 * var(--u))); white-space: nowrap; }
.jk-auto__state { position: relative; z-index: 1; font-size: max(9px, calc(18 * var(--u))); color: #ff7a7a; line-height: 1; }
.jk-auto__op {
  position: absolute;
  right: calc(-12 * var(--u));
  top: calc(-18 * var(--u));
  z-index: 2;
  font-size: max(11px, calc(26 * var(--u)));
  transform: rotate(14deg);
  color: #ffffff;
}
.jk-auto--on { animation: jk-rainbow 1.2s linear infinite; filter: drop-shadow(0 0 calc(10 * var(--u)) rgba(255, 230, 90, 0.85)); }
.jk-auto--on .jk-auto__state { color: #7dff6a; }
body.aoe-touch-mode .jk-auto {
  bottom: auto;
  top: max(64px, calc(118 * var(--u)), env(safe-area-inset-top, 0px));
  right: calc(max(8px, calc(16 * var(--u)), env(safe-area-inset-right, 0px)) + max(46px, calc(90 * var(--u))));
  width: max(110px, calc(200 * var(--u)));
}

/* ---- Top centre: the quest banner, and under it the stage panel ---- */
.jk-quest {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + max(4px, calc(8 * var(--u))));
  left: 50%;
  transform: translateX(-50%);
  padding: calc(6 * var(--u)) calc(70 * var(--u));
  background: linear-gradient(90deg, rgba(10, 10, 30, 0), rgba(10, 10, 30, 0.62) 16%, rgba(10, 10, 30, 0.62) 84%, rgba(10, 10, 30, 0));
  font-size: max(13px, calc(38 * var(--u)));
  white-space: nowrap;
  z-index: 20;
  pointer-events: none;
}
.jk-quest b { color: #ffd23a; }
.jk-quest--done { animation: jk-questdone 1.2s ease; }
.jk-panel {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + max(34px, calc(70 * var(--u))));
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  z-index: 20;
  pointer-events: none;
}
.jk-panel__title { font-size: max(13px, calc(32 * var(--u))); line-height: 1.05; }
.jk-panel__title i { color: #e8dcff; font-style: italic; }
.jk-panel__bar { position: relative; margin: calc(6 * var(--u)) auto 0; width: min(70vw, calc(480 * var(--u))); height: max(14px, calc(30 * var(--u))); border: max(2px, calc(4 * var(--u))) solid var(--jk-ink); border-radius: 999px; background: #e8303a; overflow: hidden; }
.jk-panel__fill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(180deg, #8aff7a, #2fc82b); transition: width 120ms linear; }
.jk-panel__text { position: absolute; inset: 0; display: grid; place-items: center; font-size: max(10px, calc(20 * var(--u))); }
.jk-panel__meta { font-size: max(10px, calc(20 * var(--u))); margin-top: calc(4 * var(--u)); }
.jk-panel__meta b { color: #ffd23a; }
.jk-panel--compact .jk-panel__bar { display: none; }
.jk-panel--boss .jk-panel__title { color: #ff5a6a; }
.jk-panel--boss .jk-panel__fill { background: linear-gradient(180deg, #ffb06a, #ff6a1a); }
.jk-panel--pvp .jk-panel__title { color: #ff4a5a; }
.jk-panel--pvp .jk-panel__bar { background: #3a0a10; }
.jk-panel--pvp .jk-panel__fill { background: linear-gradient(180deg, #ff8a7a, #e02a2a); }

/* ---- Popups: "+N" over the head, LUCKY! ---- */
.jk-pop img { width: calc(46 * var(--u)); height: calc(46 * var(--u)); min-width: 18px; min-height: 18px; }
.jk-pop--train { color: #ffffff; }
.jk-pop--lucky { color: #7dff6a; font-size: max(18px, calc(48 * var(--u))) !important; }
.jk-pop__mult { font-size: 0.62em; margin-left: calc(4 * var(--u)); }

/* ---- Windows ---- */
.jk-modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(6, 8, 18, 0.32); padding: calc(env(safe-area-inset-top, 0px) + 6px) 6px calc(env(safe-area-inset-bottom, 0px) + 6px); }
.jk-win {
  --hc: #ffa21a;
  --hd: #e8701a;
  position: relative;
  width: min(94vw, calc(1000 * var(--u)));
  max-height: min(92vh, calc(900 * var(--u)));
  display: flex;
  flex-direction: column;
  border: max(3px, calc(6 * var(--u))) solid var(--jk-ink);
  border-radius: calc(24 * var(--u));
  background: linear-gradient(180deg, var(--hc), var(--hd));
  box-shadow: 0 calc(10 * var(--u)) 0 rgba(0, 0, 0, 0.3), 0 calc(20 * var(--u)) calc(40 * var(--u)) rgba(0, 0, 0, 0.35);
  overflow: hidden;
  animation: jk-open 180ms cubic-bezier(0.3, 1.5, 0.5, 1);
}
.jk-win--small { width: min(94vw, calc(820 * var(--u))); }
.jk-win__head {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: calc(14 * var(--u));
  padding: calc(10 * var(--u)) calc(16 * var(--u));
  min-height: calc(92 * var(--u));
}
.jk-win__head::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: var(--jk-studs);
  background-size: calc(30 * var(--u)) calc(30 * var(--u));
  opacity: 0.6;
  pointer-events: none;
}
.jk-win__icon { position: relative; width: calc(72 * var(--u)); height: calc(72 * var(--u)); min-width: 30px; min-height: 30px; display: grid; place-items: center; }
.jk-win__icon img, .jk-win__icon svg { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.4)); }
.jk-win__title { position: relative; flex: 1 1 auto; font-size: max(20px, calc(56 * var(--u))); line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jk-win__extra { position: relative; font-size: max(12px, calc(28 * var(--u))); white-space: nowrap; }
.jk-exit {
  position: relative;
  flex: 0 0 auto;
  padding: calc(8 * var(--u)) calc(30 * var(--u));
  border: max(2px, calc(5 * var(--u))) solid var(--jk-ink);
  border-radius: calc(12 * var(--u));
  background: linear-gradient(180deg, #ff4a6a, #c8102c);
  box-shadow: inset 0 calc(3 * var(--u)) 0 rgba(255, 255, 255, 0.3), 0 calc(4 * var(--u)) 0 rgba(0, 0, 0, 0.3);
  font-size: max(15px, calc(40 * var(--u)));
  cursor: pointer;
}
.jk-exit:hover { filter: brightness(1.1); }
.jk-exit:active { transform: translateY(calc(2 * var(--u))); }
.jk-win__body {
  position: relative;
  margin: 0 calc(10 * var(--u)) calc(10 * var(--u));
  padding: calc(16 * var(--u));
  border: max(2px, calc(4 * var(--u))) solid var(--jk-ink);
  border-radius: calc(16 * var(--u));
  background-color: #e4e4e8;
  background-image: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9) 0 20%, rgba(0,0,0,0.07) 24% 32%, transparent 36%);
  background-size: calc(30 * var(--u)) calc(30 * var(--u));
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--jk-ink);
}
.jk-win__body::-webkit-scrollbar { width: 10px; }
.jk-win__body::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.25); border-radius: 6px; }
.jk-win--rebirth { --hc: #ffb03a; --hd: #ff8a1a; }
.jk-win--upgrades { --hc: #3ae8e8; --hd: #18b8c8; }
.jk-win--auras { --hc: #ff5a4a; --hd: #d8202a; }
.jk-win--characters { --hc: #c870ff; --hd: #8a2ae0; }
.jk-win--worlds { --hc: #8a7aff; --hd: #4a3ad8; }
.jk-win--boards { --hc: #ffd23a; --hd: #e8901a; }
.jk-note { text-align: center; font-size: max(11px, calc(22 * var(--u))); color: #3a3e58; margin-top: calc(10 * var(--u)); line-height: 1.35; }
.jk-note b { color: #8a2ae0; }

/* Buttons inside windows: chunky, rimmed, coloured. */
.jk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: calc(6 * var(--u));
  min-height: calc(56 * var(--u));
  padding: calc(6 * var(--u)) calc(18 * var(--u));
  border: max(2px, calc(4 * var(--u))) solid var(--jk-ink);
  border-radius: calc(12 * var(--u));
  background: linear-gradient(180deg, var(--ba, #7dff6a), var(--bb, #2fae2b));
  box-shadow: inset 0 calc(3 * var(--u)) 0 rgba(255, 255, 255, 0.35), 0 calc(4 * var(--u)) 0 rgba(0, 0, 0, 0.3);
  font-size: max(13px, calc(30 * var(--u)));
  cursor: pointer;
  white-space: nowrap;
}
.jk-btn img, .jk-btn svg { width: calc(36 * var(--u)); height: calc(36 * var(--u)); min-width: 16px; min-height: 16px; object-fit: contain; }
.jk-btn:hover:not(:disabled) { filter: brightness(1.08); }
.jk-btn:active:not(:disabled) { transform: translateY(calc(2 * var(--u))); }
.jk-btn:disabled { --ba: #c4c4cc; --bb: #8e8e98; cursor: default; }
.jk-btn--green { --ba: #8aff6a; --bb: #2fae2b; }
.jk-btn--pink { --ba: #ff8ae0; --bb: #d02aa8; }
.jk-btn--gold { --ba: #ffe25a; --bb: #ffa21a; }
.jk-btn--blue { --ba: #6ad8ff; --bb: #1a7ae0; }
.jk-btn--purple { --ba: #b06aff; --bb: #6a1ae0; }
.jk-btn--rainbow { background: var(--jk-rainbow); background-size: 200% 100%; animation: jk-rainbow 2s linear infinite; }

/* Upgrade rows (the reference's cyan rows) and aura rows (red). */
.jk-rows { display: flex; flex-direction: column; gap: calc(12 * var(--u)); }
.jk-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: calc(14 * var(--u));
  padding: calc(10 * var(--u)) calc(12 * var(--u));
  border: max(2px, calc(4 * var(--u))) solid var(--jk-ink);
  border-radius: calc(14 * var(--u));
  background: linear-gradient(180deg, var(--ra, #5af0f0), var(--rb, #22c0d0));
}
.jk-row::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: var(--jk-studs);
  background-size: calc(28 * var(--u)) calc(28 * var(--u));
  opacity: 0.45;
  pointer-events: none;
}
.jk-row > * { position: relative; }
.jk-row__icon {
  flex: 0 0 auto;
  width: calc(108 * var(--u));
  height: calc(108 * var(--u));
  min-width: 44px;
  min-height: 44px;
  border: max(2px, calc(4 * var(--u))) solid var(--jk-ink);
  border-radius: calc(10 * var(--u));
  background: linear-gradient(180deg, #1aa8b8, #0a6a7a);
  display: grid;
  place-items: center;
}
.jk-row__icon img, .jk-row__icon svg { width: 78%; height: 78%; object-fit: contain; filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.4)); }
.jk-row__main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: calc(4 * var(--u)); }
.jk-row__name { font-size: max(14px, calc(36 * var(--u))); line-height: 1; }
.jk-row__value { display: flex; align-items: center; gap: calc(12 * var(--u)); font-size: max(14px, calc(38 * var(--u))); line-height: 1; }
.jk-row__value .jk-next { color: #7dff6a; }
.jk-row__arrow { font-size: 0.8em; color: #f4f8ff; }
.jk-row__bar { width: 100%; height: max(8px, calc(16 * var(--u))); border: max(2px, calc(3 * var(--u))) solid var(--jk-ink); border-radius: 999px; background: #1a2030; overflow: hidden; }
.jk-row__fill { height: 100%; background: linear-gradient(90deg, #7dff6a, #ffe23a); }
.jk-row__side { flex: 0 0 auto; display: flex; flex-direction: column; gap: calc(8 * var(--u)); min-width: calc(170 * var(--u)); }
.jk-row__side .jk-btn { width: 100%; }
.jk-row--aura { --ra: #ff6a5a; --rb: #c81a2a; }
.jk-row--owned { --ra: #ffb06a; --rb: #e06a1a; }
.jk-row--equipped { --ra: #8aff7a; --rb: #2fae2b; }
.jk-row--locked { filter: saturate(0.55) brightness(0.92); }
.jk-row__line { display: flex; justify-content: space-between; align-items: center; width: 100%; gap: calc(10 * var(--u)); }
.jk-row__mult { color: #7dff6a; font-size: max(14px, calc(34 * var(--u))); display: inline-flex; align-items: center; gap: calc(4 * var(--u)); }
.jk-row__mult img { width: calc(40 * var(--u)); height: calc(40 * var(--u)); min-width: 16px; min-height: 16px; }
.jk-row__cost { color: #ffd23a; font-size: max(13px, calc(32 * var(--u))); display: inline-flex; align-items: center; gap: calc(6 * var(--u)); }
.jk-row__cost img { width: calc(40 * var(--u)); height: calc(40 * var(--u)); min-width: 16px; min-height: 16px; }
.jk-swatch {
  width: calc(108 * var(--u));
  height: calc(108 * var(--u));
  min-width: 44px;
  min-height: 44px;
  border: max(2px, calc(4 * var(--u))) solid var(--jk-ink);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 60%, var(--sa, #fff), var(--sb, #7a5aff) 58%, #0a0614 100%);
  box-shadow: 0 0 calc(18 * var(--u)) var(--sb, #7a5aff);
  flex: 0 0 auto;
  animation: jk-swatch 2.4s ease-in-out infinite;
}

/* The Rebirth window, as the reference lays it out. */
.jk-rb { border: max(2px, calc(4 * var(--u))) solid var(--jk-ink); border-radius: calc(14 * var(--u)); background: #f6f6f8; padding: calc(14 * var(--u)); }
.jk-rb__grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: calc(10 * var(--u)) calc(16 * var(--u)); align-items: center; }
.jk-rb__head { text-align: center; font-size: max(17px, calc(46 * var(--u))); line-height: 1; }
.jk-rb__head b { color: #ffa21a; }
.jk-rb__pill {
  position: relative;
  text-align: center;
  padding: calc(14 * var(--u)) calc(8 * var(--u));
  border: max(2px, calc(4 * var(--u))) solid var(--jk-ink);
  border-radius: calc(10 * var(--u));
  background: linear-gradient(180deg, var(--pa), var(--pb));
  font-size: max(14px, calc(36 * var(--u)));
  overflow: hidden;
}
.jk-rb__pill::before { content: ''; position: absolute; inset: 0; background-image: var(--jk-studs); background-size: calc(26 * var(--u)) calc(26 * var(--u)); opacity: 0.5; }
.jk-rb__pill span { position: relative; }
.jk-rb__pill--energy { --pa: #b06aff; --pb: #6a1ae0; }
.jk-rb__pill--level { --pa: #ffd25a; --pb: #ffa21a; }
.jk-rb__arrow { width: calc(56 * var(--u)); height: calc(56 * var(--u)); min-width: 22px; min-height: 22px; display: grid; place-items: center; font-size: max(18px, calc(44 * var(--u))); color: #ffffff; }
.jk-rb__bar { position: relative; margin: calc(16 * var(--u)) 0; height: calc(84 * var(--u)); min-height: 34px; border: max(2px, calc(5 * var(--u))) solid var(--jk-ink); border-radius: calc(12 * var(--u)); background: #2a0a4a; overflow: hidden; }
.jk-rb__bar::before { content: ''; position: absolute; inset: 0; background-image: var(--jk-studs); background-size: calc(30 * var(--u)) calc(30 * var(--u)); opacity: 0.5; z-index: 1; }
.jk-rb__fill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(180deg, #e070ff, #9a2aff 55%, #6a10c8); }
.jk-rb__barlabel { position: absolute; inset: 0; display: grid; place-items: center; font-size: max(16px, calc(46 * var(--u))); z-index: 2; }
.jk-rb__buttons { display: flex; justify-content: center; gap: calc(14 * var(--u)); }
.jk-rb__buttons .jk-btn { min-width: calc(280 * var(--u)); min-height: calc(76 * var(--u)); }
.jk-rb__keep { text-align: center; color: #1f8f2b; font-size: max(11px, calc(24 * var(--u))); margin-top: calc(8 * var(--u)); }
.jk-rb__unlocks { text-align: center; font-size: max(11px, calc(24 * var(--u))); color: #3a3e58; margin-top: calc(6 * var(--u)); }
.jk-rb__unlocks b { color: #d02aa8; }

/* Character cards: the morph row in a menu. */
.jk-cgrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: calc(12 * var(--u)); }
@media (max-width: 760px) { .jk-cgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 480px) { .jk-cgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.jk-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(2 * var(--u));
  padding: calc(8 * var(--u)) calc(6 * var(--u)) calc(10 * var(--u));
  border: max(2px, calc(4 * var(--u))) solid var(--jk-ink);
  border-radius: calc(14 * var(--u));
  background: linear-gradient(180deg, var(--ca, #e8ecf4), var(--cb, #9aa4b8));
}
.jk-card__img { width: 86%; aspect-ratio: 1; object-fit: contain; pointer-events: none; }
.jk-card__name { font-size: max(12px, calc(26 * var(--u))); line-height: 1; text-align: center; }
.jk-card__power { font-size: max(11px, calc(22 * var(--u))); color: #ffffff; }
.jk-card__req { font-size: max(10px, calc(19 * var(--u))); color: #ffe23a; display: inline-flex; align-items: center; gap: calc(4 * var(--u)); }
.jk-card__req img { width: calc(26 * var(--u)); height: calc(26 * var(--u)); min-width: 14px; min-height: 14px; }
.jk-card .jk-btn { width: 94%; min-height: calc(46 * var(--u)); font-size: max(11px, calc(22 * var(--u))); margin-top: calc(4 * var(--u)); }
.jk-card--locked .jk-card__img { filter: brightness(0.08) drop-shadow(0 0 2px rgba(255, 255, 255, 0.7)); }
.jk-card--worn { outline: max(3px, calc(6 * var(--u))) solid #ffffff; outline-offset: calc(-3 * var(--u)); box-shadow: 0 0 calc(20 * var(--u)) rgba(122, 232, 255, 0.85); }
.jk-rarity-common { --ca: #eef0f6; --cb: #9aa4b8; }
.jk-rarity-uncommon { --ca: #9aff8a; --cb: #2fae2b; }
.jk-rarity-rare { --ca: #7ad8ff; --cb: #1a7ae0; }
.jk-rarity-epic { --ca: #d88aff; --cb: #8a2ae0; }
.jk-rarity-legendary { --ca: #ffd87a; --cb: #ff8a1a; }
.jk-rarity-mythic { --ca: #ff8ab8; --cb: #d81a5a; }
.jk-rarity-divine { --ca: #fff8c8; --cb: #ffb02a; animation: jk-shine 2.4s linear infinite; background-size: 100% 220%; }
.jk-look { display: flex; justify-content: center; gap: calc(12 * var(--u)); margin-bottom: calc(14 * var(--u)); flex-wrap: wrap; }

/* World rows. */
.jk-places { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: calc(10 * var(--u)); margin-bottom: calc(14 * var(--u)); }
@media (max-width: 640px) { .jk-places { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.jk-places .jk-btn { width: 100%; font-size: max(12px, calc(24 * var(--u))); }
.jk-world { --ra: #a88aff; --rb: #5a3ad8; }
.jk-world--cleared { --ra: #8aff7a; --rb: #2fae2b; }
.jk-world--locked { --ra: #9aa0b0; --rb: #5a6070; }
.jk-world__num { flex: 0 0 auto; width: calc(84 * var(--u)); min-width: 36px; text-align: center; font-size: max(16px, calc(42 * var(--u))); }
.jk-world__main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: calc(2 * var(--u)); }
.jk-world__name { font-size: max(13px, calc(30 * var(--u))); line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jk-world__meta { font-size: max(10px, calc(20 * var(--u))); color: #f4f0ff; }
.jk-world__meta b { color: #ffe23a; }

/* Boards. */
.jk-boards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: calc(12 * var(--u)); }
@media (max-width: 900px) { .jk-boards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.jk-board { border: max(2px, calc(4 * var(--u))) solid var(--jk-ink); border-radius: calc(12 * var(--u)); background: #1c2236; padding: calc(10 * var(--u)); }
.jk-board__head { font-size: max(13px, calc(28 * var(--u))); text-align: center; margin-bottom: calc(8 * var(--u)); }
.jk-board__row { display: grid; grid-template-columns: auto 1fr auto; gap: calc(8 * var(--u)); font-size: max(11px, calc(22 * var(--u))); padding: calc(3 * var(--u)) 0; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #fff; }
.jk-board__rank { color: #ffd23a; }
.jk-board__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jk-board__value { color: #7ae8ff; }

@keyframes jk-pop { 0% { transform: scale(1); } 35% { transform: scale(1.25); } 100% { transform: scale(1); } }
@keyframes jk-bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
@keyframes jk-rainbow { from { background-position: 0% 0; } to { background-position: 200% 0; } }
@keyframes jk-maxflow { from { background-position: 0% 0; } to { background-position: 200% 0; } }
@keyframes jk-open { from { transform: scale(0.86); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes jk-shine { from { background-position: 0 0; } to { background-position: 0 220%; } }
@keyframes jk-swatch { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes jk-questdone { 0% { transform: translateX(-50%) scale(1); } 30% { transform: translateX(-50%) scale(1.15); color: #7dff6a; } 100% { transform: translateX(-50%) scale(1); } }

/* Phones: shrink the grid, keep the bottom clear of the touch controls. */
@media (max-height: 560px) {
  .jk-left { transform: translateY(-50%) scale(0.82); transform-origin: left center; }
}
body.aoe-touch-mode .jk-left { top: 40%; }
body.aoe-touch-mode .jk-bottom { width: min(calc(100vw - 330px), calc(760 * var(--u))); min-width: 200px; }
@media (orientation: portrait) {
  body.aoe-touch-mode { --aoe-controls-lift: 130px; }
  body.aoe-touch-mode .jk-bottom { width: min(94vw, calc(900 * var(--u))); }
  body.aoe-touch-mode .jk-left { top: 34%; transform: translateY(-50%) scale(0.86); transform-origin: left center; }
}
`;
  document.head.append(style);
};

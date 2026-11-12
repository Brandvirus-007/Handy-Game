import { t, fmt } from '../core/i18n';
import type { World } from '../game/world';
import { icon } from './icons';

/** In-game HUD. Writes to the DOM only when a displayed value actually changes. */
export class Hud {
  readonly root: HTMLElement;
  private hearts: HTMLElement;
  private score: HTMLElement;
  private wave: HTMLElement;
  private shards: HTMLElement;
  private combo: HTMLElement;
  private comboLabel: HTMLElement;
  private comboBar: HTMLElement;
  private boss: HTMLElement;
  private bossName: HTMLElement;
  private bossHp: HTMLElement;
  private pulse: HTMLButtonElement;
  private pulseLabel: HTMLElement;

  private v = {
    hearts: -1,
    max: -1,
    shield: false,
    score: -1,
    wave: -1,
    shards: -1,
    combo: -1,
    boss: '',
    bossHp: -1,
    pulse: -1,
    ready: false,
    noPulse: false,
  };

  private shownScore = 0;

  constructor(root: HTMLElement, onPause: () => void, onPulse: () => void) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-hearts"></div>
        <div class="hud-center"><div class="hud-score">0</div><div class="hud-wave"></div></div>
        <div class="hud-right">
          <div class="hud-shards">${icon('shard', 16)}<span>0</span></div>
          <button class="hud-pause" aria-label="${t('hud.pause')}">${icon('pause', 20)}</button>
        </div>
      </div>
      <div class="hud-boss"><div class="name"></div><div class="hp"><i style="width:100%"></i></div></div>
      <div class="hud-combo"><div class="label"></div><div class="timer"><i></i></div></div>
      <button class="hud-pulse" aria-label="${t('hud.pulse')}"><span>${t('hud.pulse')}</span></button>`;
    this.hearts = root.querySelector('.hud-hearts')!;
    this.score = root.querySelector('.hud-score')!;
    this.wave = root.querySelector('.hud-wave')!;
    this.shards = root.querySelector('.hud-shards span')!;
    this.combo = root.querySelector('.hud-combo')!;
    this.comboLabel = root.querySelector('.hud-combo .label')!;
    this.comboBar = root.querySelector('.hud-combo .timer i')!;
    this.boss = root.querySelector('.hud-boss')!;
    this.bossName = root.querySelector('.hud-boss .name')!;
    this.bossHp = root.querySelector('.hud-boss .hp i')!;
    this.pulse = root.querySelector('.hud-pulse')!;
    this.pulseLabel = root.querySelector('.hud-pulse span')!;
    const pauseBtn = root.querySelector<HTMLButtonElement>('.hud-pause')!;
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPause();
    });
    this.pulse.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPulse();
    });
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  /** Forces a full redraw on the next update (e.g. after a language change). */
  invalidate(): void {
    for (const k of Object.keys(this.v) as (keyof typeof this.v)[]) {
      const cur = this.v[k];
      (this.v as Record<string, unknown>)[k] = typeof cur === 'number' ? -1 : typeof cur === 'string' ? '\u0000' : !cur;
    }
    this.pulseLabel.textContent = t('hud.pulse');
  }

  update(w: World): void {
    const v = this.v;
    const tutorial = w.opts.tutorial;
    if (w.hearts !== v.hearts || w.stats.maxHearts !== v.max || w.shieldUp !== v.shield) {
      const lost = w.hearts < v.hearts;
      let html = '';
      if (w.stats.maxHearts > 5) {
        // Many hearts (upgrades + boosters) would run into the score – show a compact counter.
        html = `${icon('heart', 22, lost ? 'lost' : '')}<b class="heart-count">${w.hearts}<small>/${w.stats.maxHearts}</small></b>`;
      } else {
        for (let i = 0; i < w.stats.maxHearts; i++) {
          const full = i < w.hearts;
          html += icon(full ? 'heart' : 'heartEmpty', 22, full ? '' : lost && i === w.hearts ? 'empty lost' : 'empty');
        }
      }
      if (w.shieldUp) html += `<span class="shield">${icon('shield', 20)}</span>`;
      this.hearts.innerHTML = html;
      v.hearts = w.hearts;
      v.max = w.stats.maxHearts;
      v.shield = w.shieldUp;
    }
    if (w.run.score !== v.score) {
      if (w.run.score < this.shownScore || v.score < 0) this.shownScore = w.run.score; // new run
      this.score.classList.remove('bump');
      void this.score.offsetWidth;
      this.score.classList.add('bump');
      v.score = w.run.score;
    }
    // The score counts up instead of jumping.
    if (this.shownScore !== w.run.score) {
      const diff = w.run.score - this.shownScore;
      this.shownScore = diff <= 2 ? w.run.score : this.shownScore + Math.max(1, Math.ceil(diff * 0.18));
      this.score.textContent = fmt(this.shownScore);
    }
    if (w.wave !== v.wave) {
      this.wave.textContent = tutorial ? t('tut.title') : t('hud.wave', { n: w.wave });
      v.wave = w.wave;
    }
    if (w.run.shards !== v.shards) {
      this.shards.textContent = fmt(w.run.shards);
      v.shards = w.run.shards;
    }

    const combo = w.combo >= 2 ? w.combo : 0;
    if (combo !== v.combo) {
      this.combo.classList.toggle('on', combo > 0);
      if (combo > 0) {
        this.comboLabel.textContent = t('float.combo', { n: combo });
        this.comboLabel.dataset.tier = combo >= 10 ? '3' : combo >= 5 ? '2' : '1';
        this.comboLabel.classList.remove('pop');
        void this.comboLabel.offsetWidth;
        this.comboLabel.classList.add('pop');
      }
      v.combo = combo;
    }
    if (combo > 0) this.comboBar.style.transform = `scaleX(${Math.max(0, w.comboTimer / w.stats.comboWindow).toFixed(3)})`;

    const bosses = w.bosses();
    const bossKey = bosses.length ? bosses[0].type : '';
    if (bossKey !== v.boss) {
      this.boss.classList.toggle('on', !!bossKey);
      if (bossKey) this.bossName.textContent = t(`enemy.${bosses[0].type}` as 'enemy.maw');
      v.boss = bossKey;
    }
    if (bosses.length) {
      let hp = 0;
      let max = 0;
      for (const b of bosses) {
        hp += b.hp;
        max += b.maxHp;
      }
      // Dead twin still counts towards the max so the bar keeps its scale.
      if (bosses[0].type === 'twin' && bosses.length === 1) max += bosses[0].maxHp;
      const pct = Math.round((hp / Math.max(1, max)) * 1000) / 10;
      if (pct !== v.bossHp) {
        this.bossHp.style.width = `${pct}%`;
        v.bossHp = pct;
      }
    }

    if (w.stats.noPulse !== v.noPulse) {
      this.pulse.classList.toggle('off', w.stats.noPulse);
      v.noPulse = w.stats.noPulse;
    }
    const p = Math.round(Math.min(1, w.pulseCharge) * 50) / 50;
    this.pulse.classList.toggle('double', w.pulseCharge >= 2);
    if (p !== v.pulse) {
      this.pulse.style.setProperty('--p', String(p));
      v.pulse = p;
    }
    const ready = w.pulseReady;
    if (ready !== v.ready) {
      this.pulse.classList.toggle('ready', ready);
      v.ready = ready;
    }
  }
}

import { clamp, damp } from './core/math';
import { dailySeed, localDateKey, randomSeed } from './core/rng';
import { SaveStore } from './core/storage';
import { detectLang, setLang, t, type I18nKey } from './core/i18n';
import { TUNING } from './game/config';
import { World } from './game/world';
import { getCharacter, CHARACTERS } from './game/characters';
import { META, metaCost, getMeta } from './game/meta';
import { dailySetup, type DailySetup } from './game/modifiers';
import type { AchievementId } from './game/achievements';
import type { BossType, CharacterId, GameEvent, MetaId, ModifierId, UpgradeId } from './game/types';
import { Renderer, type ArenaRect } from './render/renderer';
import { Fx } from './render/fx';
import { AudioEngine } from './audio/audio';
import { Haptics } from './haptics';
import { Input } from './input';
import { UI } from './ui/ui';
import { Tutorial } from './tutorial';

export interface RunResult {
  score: number;
  wave: number;
  kills: number;
  loops: number;
  bestLoop: number;
  maxCombo: number;
  time: number;
  shards: number;
  newBest: boolean;
  daily: boolean;
  newAchievements: AchievementId[];
  canAfford: boolean;
}

type State = 'menu' | 'playing' | 'paused' | 'upgrade' | 'dying' | 'gameover';

interface RunSetup {
  daily: boolean;
  tutorial: boolean;
  character: CharacterId;
  modifiers: ModifierId[];
  seed: number;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const DT = TUNING.dt;
const HUD_TOP = 60;

export class App {
  readonly save = new SaveStore();
  readonly audio = new AudioEngine();
  readonly haptics = new Haptics();
  readonly fx = new Fx();
  readonly renderer: Renderer;
  readonly ui: UI;
  readonly input: Input;

  world: World | null = null;
  state: State = 'menu';
  tutorial: Tutorial | null = null;
  canInstall = false;
  showIosHint = false;

  private setup: RunSetup | null = null;
  private pendingDx = 0;
  private pendingDy = 0;
  private acc = 0;
  private last = 0;
  private time = 0;
  private timeScale = 1;
  private slowmo = 0;
  private dyingTimer = 0;
  private offer: UpgradeId[] = [];
  private newAch: AchievementId[] = [];
  private arena: ArenaRect = { x: 0, y: 0, w: 1, h: 1 };
  private dim = 0.15;
  private frameAvg = 16;
  private slowTime = 0;
  private autoLow = false;
  private installEvent: BeforeInstallPromptEvent | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;
  private daily: DailySetup | null = null;
  private lang = '';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.ui = new UI(this);
    this.input = new Input(canvas, {
      drag: (dx, dy) => {
        this.pendingDx += dx;
        this.pendingDy += dy;
      },
      pulse: () => this.pulse(),
      pause: () => this.pause(),
      gesture: () => this.audio.unlock(),
    });
  }

  boot(): void {
    this.applySettings(false);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      this.audio.setVisible(visible);
      if (!visible) {
        if (this.state === 'playing') this.pause();
        this.save.save();
      } else if (this.state === 'playing') {
        void this.lockScreen();
      }
    });
    window.addEventListener('pagehide', () => this.save.save());
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent = e as BeforeInstallPromptEvent;
      this.canInstall = true;
      if (this.state === 'menu' && this.ui.screenName === 'menu') this.ui.showMenu();
    });
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
    this.showIosHint = /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;

    this.ui.showMenu();
    this.audio.setIntensity(0);
    requestAnimationFrame(this.loop);
  }

  // ───────────────────────── Layout ─────────────────────────

  private readSafe(): { t: number; r: number; b: number; l: number } {
    const probe = document.getElementById('safe-probe');
    if (!probe) return { t: 0, r: 0, b: 0, l: 0 };
    const cs = getComputedStyle(probe);
    return {
      t: parseFloat(cs.paddingTop) || 0,
      r: parseFloat(cs.paddingRight) || 0,
      b: parseFloat(cs.paddingBottom) || 0,
      l: parseFloat(cs.paddingLeft) || 0,
    };
  }

  private get lowQuality(): boolean {
    const q = this.save.data.settings.quality;
    return q === 'low' || (q === 'auto' && this.autoLow);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.lowQuality ? 1.25 : 2);
    this.renderer.resize(w, h, dpr);
    const s = this.readSafe();
    this.arena = {
      x: s.l + 8,
      y: s.t + HUD_TOP,
      w: Math.max(100, w - s.l - s.r - 16),
      h: Math.max(100, h - s.t - HUD_TOP - s.b - 10),
    };
    if (this.world) this.renderer.layout(this.world.w, this.world.h, this.arena);
  }

  private worldSize(): { w: number; h: number } {
    const aspect = this.arena.h / this.arena.w;
    // Portrait: fixed width keeps difficulty identical across phones; height follows the aspect.
    if (aspect >= 1) return { w: 390, h: Math.round(clamp(390 * aspect, 540, 920)) };
    // Landscape (desktop/tablet): cap the width so enemy density stays comparable; the rest is letterboxed.
    return { w: Math.round(clamp(560 / aspect, 560, 820)), h: 560 };
  }

  // ───────────────────────── Settings ─────────────────────────

  applySettings(persist = true): void {
    const st = this.save.data.settings;
    this.audio.setVolumes(st.music, st.sfx);
    this.haptics.enabled = st.haptics;
    this.fx.settings.shake = st.shake;
    this.fx.settings.reducedMotion = st.reducedMotion;
    this.fx.settings.density = this.lowQuality ? 0.55 : 1;
    document.body.classList.toggle('reduced', st.reducedMotion);
    const lang = st.lang === 'auto' ? detectLang() : st.lang;
    if (lang !== this.lang) {
      this.lang = lang;
      setLang(lang);
      document.title = `${t('app.title')} – ${t('app.tagline')}`;
      this.ui.hud.invalidate();
    }
    if (persist) {
      this.resize();
      this.save.save();
    }
  }

  dailyInfo(): DailySetup {
    const date = localDateKey();
    if (!this.daily || this.daily.date !== date) this.daily = dailySetup(date, dailySeed(date));
    return this.daily;
  }

  // ───────────────────────── Run lifecycle ─────────────────────────

  startRun(daily: boolean): void {
    if (!this.save.data.tutorialDone && !daily) {
      this.startTutorial();
      return;
    }
    const d = daily ? this.dailyInfo() : null;
    this.begin({
      daily,
      tutorial: false,
      character: d ? d.character : this.save.data.selected,
      modifiers: d ? d.modifiers : [],
      seed: d ? d.seed : randomSeed(),
    });
  }

  startTutorial(): void {
    this.begin({ daily: false, tutorial: true, character: this.save.data.selected, modifiers: [], seed: 1 });
    this.tutorial = new Tutorial(this, this.world!);
  }

  finishTutorial(): void {
    this.save.data.tutorialDone = true;
    this.save.save();
    this.ui.clearTutorial();
    this.tutorial = null;
    this.startRun(false);
  }

  private begin(setup: RunSetup): void {
    this.setup = setup;
    this.ui.clearTutorial();
    this.tutorial = null;
    this.fx.clear();
    this.ui.clearBanner();
    const size = this.worldSize();
    const world = new World({
      width: size.w,
      height: size.h,
      character: setup.character,
      seed: setup.seed,
      modifiers: setup.modifiers,
      meta: setup.tutorial ? {} : { ...this.save.data.meta },
      daily: setup.daily,
      tutorial: setup.tutorial,
    });
    this.world = world;
    this.renderer.layout(world.w, world.h, this.arena);
    this.fx.playerColor = getCharacter(setup.character).color;
    world.start();
    this.newAch = [];
    this.acc = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.pendingDx = this.pendingDy = 0;
    this.state = 'playing';
    this.ui.close();
    this.ui.hud.invalidate();
    this.ui.hud.show(true);
    this.input.reset();
    this.input.enabled = true;
    this.audio.duck(false);
    this.audio.setIntensity(1);
    void this.lockScreen();
  }

  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.input.enabled = false;
      this.audio.duck(true);
      this.ui.showPause();
      this.releaseScreen();
    } else if (this.state === 'paused' && this.ui.screenName === 'pause') {
      this.resume();
    }
  }

  resume(): void {
    if (this.state !== 'paused' || !this.world) return;
    this.state = 'playing';
    this.ui.close();
    this.audio.duck(false);
    this.input.reset();
    this.input.enabled = true;
    this.pendingDx = this.pendingDy = 0;
    this.acc = 0;
    // A short grace period so resuming never causes an instant hit.
    this.world.invuln = Math.max(this.world.invuln, 0.8);
    void this.lockScreen();
  }

  restart(): void {
    const s = this.setup;
    if (s?.tutorial) this.startTutorial();
    else this.startRun(s?.daily ?? false);
  }

  /** Leaves the run without showing a screen (caller decides what comes next). */
  toMenuState(): void {
    this.world = null;
    this.tutorial = null;
    this.ui.clearTutorial();
    this.ui.clearBanner();
    this.state = 'menu';
    this.input.enabled = false;
    this.ui.hud.show(false);
    this.fx.clear();
    this.audio.duck(false);
    this.audio.setIntensity(0);
    this.releaseScreen();
  }

  quitToMenu(): void {
    this.toMenuState();
    this.ui.showMenu();
  }

  pulse(): void {
    if (this.state !== 'playing' || !this.world) return;
    if (!this.world.triggerPulse()) {
      if (!this.world.stats.noPulse) this.audio.denied();
    }
  }

  private openUpgrade(): void {
    const w = this.world!;
    this.offer = w.rollOffer();
    if (this.offer.length === 0) {
      w.nextWave();
      return;
    }
    this.state = 'upgrade';
    this.input.enabled = false;
    this.input.reset();
    this.audio.duck(true);
    this.ui.showUpgrade(this.offer, w.wave, w.rerolls);
  }

  pickUpgrade(id: UpgradeId): void {
    const w = this.world;
    if (!w || this.state !== 'upgrade') return;
    w.applyUpgrade(id);
    w.nextWave();
    this.state = 'playing';
    this.ui.close();
    this.audio.duck(false);
    this.input.reset();
    this.input.enabled = true;
    this.pendingDx = this.pendingDy = 0;
  }

  rerollUpgrade(): void {
    const w = this.world;
    if (!w || this.state !== 'upgrade') return;
    const o = w.reroll();
    if (!o) return;
    this.offer = o;
    this.ui.showUpgrade(o, w.wave, w.rerolls);
  }

  private endRun(): void {
    const w = this.world!;
    const r = w.run;
    const s = this.save.data;
    const setup = this.setup!;
    this.state = 'gameover';

    const st = s.stats;
    st.runs++;
    st.loops += r.loops;
    st.kills += r.kills;
    st.bossKills += r.bossesKilled.length;
    st.playTime += r.time;
    st.shardsTotal += r.shards;
    st.bestLoop = Math.max(st.bestLoop, r.bestLoop);
    st.bestCombo = Math.max(st.bestCombo, r.maxCombo);
    st.bestWave = Math.max(st.bestWave, r.wave);
    s.bank += r.shards;

    let newBest = false;
    if (setup.daily) {
      const date = this.dailyInfo().date;
      if (s.daily.date !== date) {
        s.daily = { date, best: r.score };
        newBest = r.score > 0;
      } else if (r.score > s.daily.best) {
        s.daily.best = r.score;
        newBest = true;
      }
      this.unlock('daily');
    } else {
      if (r.score > s.best) {
        s.best = r.score;
        newBest = true;
      }
      s.bestWave = Math.max(s.bestWave, r.wave);
    }
    if (r.score >= 10000) this.unlock('score10k');
    if (r.score >= 50000) this.unlock('score50k');
    if (st.shardsTotal >= 1000) this.unlock('shards1000');
    this.save.save();

    const canAfford = META.some((m) => (s.meta[m.id] ?? 0) < m.max && s.bank >= metaCost(m, s.meta[m.id] ?? 0));
    this.ui.hud.show(false);
    this.audio.duck(true);
    this.audio.setIntensity(0);
    this.releaseScreen();
    this.ui.showGameOver({
      score: r.score,
      wave: r.wave,
      kills: r.kills,
      loops: r.loops,
      bestLoop: r.bestLoop,
      maxCombo: r.maxCombo,
      time: r.time,
      shards: r.shards,
      newBest,
      daily: setup.daily,
      newAchievements: [...this.newAch],
      canAfford,
    });
  }

  // ───────────────────────── Economy ─────────────────────────

  buyMeta(id: MetaId): boolean {
    const s = this.save.data;
    const def = getMeta(id);
    const lv = s.meta[id] ?? 0;
    const cost = metaCost(def, lv);
    if (lv >= def.max || s.bank < cost) {
      this.audio.denied();
      return false;
    }
    s.bank -= cost;
    s.meta[id] = lv + 1;
    this.save.save();
    this.audio.purchase();
    this.haptics.buzz(25);
    return true;
  }

  buyChar(id: CharacterId): boolean {
    const s = this.save.data;
    const c = getCharacter(id);
    if (s.chars.includes(id) || s.bank < c.price) {
      this.audio.denied();
      return false;
    }
    s.bank -= c.price;
    s.chars.push(id);
    s.selected = id;
    this.save.save();
    this.audio.purchase();
    this.haptics.buzz(25);
    if (CHARACTERS.every((ch) => s.chars.includes(ch.id))) this.unlock('all_chars');
    return true;
  }

  selectChar(id: CharacterId): void {
    if (!this.save.data.chars.includes(id)) return;
    this.save.data.selected = id;
    this.save.save();
    this.audio.uiSelect();
  }

  resetSave(): void {
    this.save.reset();
    this.applySettings();
  }

  install(): void {
    const ev = this.installEvent;
    if (!ev) return;
    this.installEvent = null;
    this.canInstall = false;
    void ev.prompt().catch(() => undefined);
    if (this.ui.screenName === 'menu') this.ui.showMenu();
  }

  private unlock(id: AchievementId): void {
    const s = this.save.data;
    if (s.ach[id]) return;
    s.ach[id] = Date.now();
    this.newAch.push(id);
    this.save.save();
    this.ui.toast(t('ach.unlocked'), t(`ach.${id}.name` as I18nKey));
    this.audio.achievement();
  }

  // ───────────────────────── Screen wake lock ─────────────────────────

  private async lockScreen(): Promise<void> {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wl && !this.wakeLock) this.wakeLock = await wl.request('screen');
    } catch {
      this.wakeLock = null;
    }
  }

  private releaseScreen(): void {
    const lock = this.wakeLock;
    this.wakeLock = null;
    lock?.release().catch(() => undefined);
  }

  // ───────────────────────── Main loop ─────────────────────────

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const rdt = this.last ? clamp((now - this.last) / 1000, 0, 0.1) : DT;
    this.last = now;
    this.time += rdt;

    const w = this.world;
    if (w && (this.state === 'playing' || this.state === 'dying')) {
      this.trackPerformance(rdt);
      this.stepWorld(w, rdt);
    }
    if (this.state === 'menu') this.fx.ambient(this.renderer.cssW, this.renderer.cssH);

    const paused = this.state === 'paused';
    this.fx.update(paused ? 0 : rdt * (this.state === 'playing' || this.state === 'dying' ? Math.max(0.3, this.timeScale) : 1));

    const dimTarget = this.state === 'menu' ? 0.12 : paused || this.state === 'upgrade' ? 0.35 : this.state === 'gameover' ? 0.45 : 0;
    this.dim = damp(this.dim, dimTarget, 8, rdt);

    const c = getCharacter(this.setup?.character ?? this.save.data.selected);
    const showWorld = this.state !== 'menu' ? this.world : null;
    this.renderer.frame({
      world: showWorld,
      fx: this.fx,
      time: this.time,
      color: c.color,
      trailColor: c.trail,
      rainbow: c.rainbow,
      dim: this.dim,
      hint: this.tutorial?.hint() ?? null,
    });
    if (showWorld && this.state !== 'gameover') this.ui.hud.update(showWorld);
  };

  private trackPerformance(rdt: number): void {
    this.frameAvg += (rdt * 1000 - this.frameAvg) * 0.05;
    if (this.save.data.settings.quality !== 'auto' || this.autoLow) return;
    if (this.frameAvg > 24) this.slowTime += rdt;
    else this.slowTime = Math.max(0, this.slowTime - rdt);
    if (this.slowTime > 3) {
      this.autoLow = true;
      this.applySettings(false);
      this.resize();
    }
  }

  private stepWorld(w: World, rdt: number): void {
    if (this.pendingDx || this.pendingDy) {
      const k = this.save.data.settings.sensitivity / this.renderer.scale;
      w.steer(this.pendingDx * k, this.pendingDy * k);
      this.pendingDx = this.pendingDy = 0;
    }
    const kb = this.input.enabled ? this.input.keyboard() : { x: 0, y: 0 };
    w.setKeyboard(kb.x, kb.y);

    if (this.fx.hitstop > 0) {
      this.fx.hitstop -= rdt;
      return;
    }
    if (this.slowmo > 0) this.slowmo -= rdt;
    const target = this.state === 'dying' ? 0.25 : this.slowmo > 0 ? 0.35 : 1;
    this.timeScale = damp(this.timeScale, target, this.slowmo > 0 || this.state === 'dying' ? 14 : 5, rdt);
    this.acc += rdt * this.timeScale;
    let steps = 0;
    while (this.acc >= DT && steps < 5) {
      w.update(DT);
      this.acc -= DT;
      steps++;
      this.processEvents(w, w.drainEvents());
      if (this.fx.hitstop > 0) break;
    }
    if (steps >= 5) this.acc = 0;
    this.tutorial?.update(rdt);

    if (this.state === 'playing' && w.awaitingUpgrade) this.openUpgrade();
    if (this.state === 'playing' && w.over) {
      this.state = 'dying';
      this.dyingTimer = 1.6;
      this.input.enabled = false;
    }
    if (this.state === 'dying') {
      this.dyingTimer -= rdt;
      if (this.dyingTimer <= 0) this.endRun();
    }
  }

  private processEvents(w: World, events: GameEvent[]): void {
    for (const e of events) {
      this.fx.handle(e);
      this.tutorial?.onEvent(e);
      switch (e.type) {
        case 'loop':
          this.audio.loop(e.kills, e.combo, e.echo);
          if (e.kills > 0) this.haptics.buzz(Math.min(45, 12 + e.kills * 5));
          this.unlock('first_loop');
          if (e.kills >= 5) this.unlock('multi5');
          if (e.kills >= 10) this.unlock('multi10');
          break;
        case 'kill':
          this.audio.kill(e.r > 14 || e.elite);
          break;
        case 'enemyHit':
          this.audio.enemyHit();
          break;
        case 'playerHit':
          this.audio.playerHit();
          this.haptics.buzz([45, 35, 70], 0);
          break;
        case 'shieldBreak':
          this.audio.shieldBreak();
          this.haptics.buzz(35, 0);
          break;
        case 'shieldUp':
          this.audio.shieldUp();
          break;
        case 'playerDeath':
          this.audio.gameOver();
          this.haptics.buzz([90, 50, 180], 0);
          this.audio.setIntensity(0);
          break;
        case 'revive':
          this.audio.revive();
          this.ui.showBanner(t('banner.revive'));
          break;
        case 'pickup':
          this.audio.pickup(e.kind);
          break;
        case 'heal':
          this.audio.heal();
          break;
        case 'pulse':
          this.audio.pulse();
          this.haptics.buzz(30, 0);
          if (e.kills >= 5) this.unlock('pulse5');
          break;
        case 'pulseReady':
          this.audio.pulseReady();
          break;
        case 'trailCut':
          this.audio.cut();
          this.haptics.buzz(12);
          break;
        case 'spawnWarn':
          this.audio.spawnWarn(e.enemy === 'maw' || e.enemy === 'weaver' || e.enemy === 'twin');
          break;
        case 'shoot':
          this.audio.shoot();
          break;
        case 'explosion':
          if (e.r > 10) this.audio.explosion(e.r > 20);
          break;
        case 'chain':
          this.audio.chain();
          break;
        case 'waveStart':
          this.audio.waveStart(!!e.boss);
          if (e.boss) {
            const type = e.boss === 'twins' ? 'twin' : e.boss;
            this.ui.showBanner(t('banner.bossWave', { n: e.wave }), `<b>${t(`enemy.${type}` as I18nKey)}</b> – ${t(`hint.${type}` as I18nKey)}`, true, 2600);
            this.audio.setIntensity(3);
          } else {
            this.ui.showBanner(t('banner.wave', { n: e.wave }), e.newEnemy ? this.ui.newEnemyText(e.newEnemy) : '', false, e.newEnemy ? 2800 : 1900);
            this.audio.setIntensity(e.wave >= 8 ? 2 : 1);
          }
          break;
        case 'waveClear':
          this.audio.waveClear(e.flawless);
          this.haptics.buzz(25);
          this.ui.showBanner(t('banner.cleared'), e.flawless ? t('banner.flawless') : '', false, 1500);
          if (e.wave >= 5) this.unlock('wave5');
          if (e.wave >= 10) this.unlock('wave10');
          if (e.wave >= 15) this.unlock('wave15');
          if (e.wave >= 20) this.unlock('wave20');
          if (e.wave >= 5 && w.run.damageTaken === 0) this.unlock('flawless5');
          if (w.run.score >= 10000) this.unlock('score10k');
          if (w.run.score >= 50000) this.unlock('score50k');
          if (e.boss) this.audio.setIntensity(1);
          break;
        case 'bossSpawn':
          this.audio.bossRoar();
          this.haptics.buzz([60, 40, 60], 0);
          break;
        case 'bossPhase':
          this.audio.bossRoar();
          break;
        case 'bossDeath': {
          this.audio.bossDeath();
          this.haptics.buzz([80, 50, 140], 0);
          const type = e.boss === 'twins' ? 'twin' : e.boss;
          this.ui.showBanner(t('banner.bossDown', { name: t(`enemy.${type}` as I18nKey) }), '', false, 2000);
          const ach: Record<BossType, AchievementId> = { maw: 'boss_maw', weaver: 'boss_weaver', twins: 'boss_twins' };
          this.unlock(ach[e.boss]);
          break;
        }
        case 'bossAttack':
          this.audio.shoot();
          break;
        case 'slowmo':
          this.slowmo = Math.max(this.slowmo, e.duration);
          break;
        case 'combo':
          if (e.combo >= 10) this.unlock('combo10');
          break;
        case 'comboLost':
          this.fx.text(t('float.comboLost'), w.px, w.py - 24, '#a39ccc', 11, 0.8);
          break;
        default:
          break;
      }
    }
  }
}

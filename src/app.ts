import { clamp, damp } from './core/math';
import { dailySeed, localDateKey, randomSeed } from './core/rng';
import { SaveStore } from './core/storage';
import { detectLang, setLang, t, type I18nKey } from './core/i18n';
import { BIOMES, TUNING, biomeForWave } from './game/config';
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
import { createPlatform, type Platform } from './platform';
import { WebPlatform } from './platform/web';
import type { CompletedPurchase, StoreProduct } from './platform/types';
import {
  EXCHANGE,
  FREE_DIAMOND_AD_REWARD,
  INTERSTITIAL,
  REVIVE_COINS,
  REVIVE_DIAMONDS,
  diamondsForCoins,
  getProduct,
  reviveCost,
  xpForRun,
  type BoosterId,
  type Currency,
  type ProductId,
  type Reward,
} from './economy/defs';
import {
  achievementDiamonds,
  addXp,
  availableBoosters,
  canClaimMissionBonus,
  claimLogin,
  claimMilestone,
  claimMission,
  claimMissionBonus,
  countFreeDiamondAd,
  creditPurchase,
  ensureMissions,
  freeDiamondAdsLeft,
  grant,
  loginDayToClaim,
  payBoosters,
  progressMissions,
  spend,
  type LevelUp,
} from './economy/profile';

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
  xp: number;
  levelUps: LevelUp[];
  milestones: { wave: number; diamonds: number }[];
  missionsDone: number;
  canDouble: boolean;
}

export interface ContinueOffer {
  adAvailable: boolean;
  coins: number;
  diamonds: number;
}

type State = 'menu' | 'playing' | 'paused' | 'upgrade' | 'dying' | 'continue' | 'gameover';

interface RunSetup {
  daily: boolean;
  tutorial: boolean;
  character: CharacterId;
  modifiers: ModifierId[];
  seed: number;
  boosters: BoosterId[];
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
  /** Ads, purchases and device features (Android or browser demo). */
  platform: Platform = new WebPlatform();
  products: StoreProduct[] = [];

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
  private daily: DailySetup | null = null;
  private lang = '';
  /** Per-run monetisation state. */
  private runAds = { revive: false, reroll: false, double: false };
  private paidRevives = 0;
  private runMilestones: { wave: number; diamonds: number }[] = [];
  private lastResult: RunResult | null = null;
  private busy = false;

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
    this.haptics.sink = (p) => this.platform.vibrate(p);
  }

  async boot(): Promise<void> {
    this.platform = await createPlatform();
    try {
      await this.platform.init();
    } catch {
      /* the game must run even if a plugin fails */
    }
    this.applySettings(false);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => this.setActive(document.visibilityState === 'visible'));
    window.addEventListener('pagehide', () => this.save.save());
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent = e as BeforeInstallPromptEvent;
      this.canInstall = true;
      if (this.state === 'menu' && this.ui.screenName === 'menu') this.ui.showMenu();
    });
    this.platform.onBackButton(() => this.back());
    this.platform.onPauseResume((active) => this.setActive(active));
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
    this.showIosHint = !__SINGLE_FILE__ && !this.platform.native && /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;

    ensureMissions(this.save.data, localDateKey());
    this.save.save();
    this.ui.showMenu();
    this.audio.setIntensity(0);
    requestAnimationFrame(this.loop);

    // Store data loads in the background; purchases that were paid but not yet credited are recovered.
    void this.platform.getProducts().then((p) => (this.products = p));
    void this.platform.recoverPurchases((p) => void this.credit(p));
    void this.restoreEntitlements(true);
    setTimeout(() => this.offerDailyLogin(), 700);
  }

  private setActive(active: boolean): void {
    this.audio.setVisible(active);
    if (!active) {
      if (this.state === 'playing') this.pause();
      this.save.save();
    } else if (this.state === 'playing') {
      this.platform.keepAwake(true);
    }
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

  /** "Play": first time → tutorial, otherwise the booster/preparation screen. */
  startRun(daily: boolean): void {
    if (!this.save.data.tutorialDone && !daily) {
      this.startTutorial();
      return;
    }
    this.toMenuState();
    this.ui.showPrerun(daily);
  }

  /** Called by the preparation screen. Pays for the boosters and starts the run. */
  launchRun(daily: boolean, boosters: BoosterId[]): boolean {
    const s = this.save.data;
    const allowed = availableBoosters(s).map((b) => b.id);
    const chosen = boosters.filter((b) => allowed.includes(b));
    if (!payBoosters(s, chosen)) {
      this.audio.denied();
      return false;
    }
    s.boosters = chosen;
    this.save.save();
    const d = daily ? this.dailyInfo() : null;
    this.begin({
      daily,
      tutorial: false,
      character: d ? d.character : s.selected,
      modifiers: d ? d.modifiers : [],
      seed: d ? d.seed : randomSeed(),
      boosters: chosen,
    });
    return true;
  }

  startTutorial(): void {
    this.begin({ daily: false, tutorial: true, character: this.save.data.selected, modifiers: [], seed: 1, boosters: [] });
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
      boosters: setup.boosters,
    });
    this.world = world;
    this.renderer.layout(world.w, world.h, this.arena);
    this.renderer.setBiome(0);
    this.fx.playerColor = getCharacter(setup.character).color;
    world.start();
    this.newAch = [];
    this.runAds = { revive: false, reroll: false, double: false };
    this.paidRevives = 0;
    this.runMilestones = [];
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
    this.platform.keepAwake(true);
  }

  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.input.enabled = false;
      this.audio.duck(true);
      this.ui.showPause();
      this.platform.keepAwake(false);
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
    this.platform.keepAwake(true);
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
    this.platform.keepAwake(false);
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

  /** Android back button. */
  back(): void {
    if (this.ui.closeTopDialog()) return;
    switch (this.state) {
      case 'playing':
        this.pause();
        return;
      case 'paused':
        if (this.ui.screenName === 'settings') this.ui.showPause();
        else this.resume();
        return;
      case 'gameover':
        void this.afterRun(() => this.quitToMenu());
        return;
      case 'menu':
        if (this.ui.screenName === 'menu' || this.ui.screenName === '') {
          this.ui.dialog(t('app.exitConfirm'), t('app.exit'), () => this.platform.exitApp());
        } else {
          this.audio.uiBack();
          this.ui.showMenu();
        }
        return;
      default:
        return; // upgrade choice and continue dialog need an explicit decision
    }
  }

  // ───────────────────────── Upgrades ─────────────────────────

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
    this.ui.showUpgrade(this.offer, w.wave, w.rerolls, !this.runAds.reroll && !w.opts.tutorial);
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
    this.ui.showUpgrade(o, w.wave, w.rerolls, !this.runAds.reroll);
  }

  async adReroll(): Promise<void> {
    const w = this.world;
    if (!w || this.state !== 'upgrade' || this.runAds.reroll || this.busy) return;
    this.busy = true;
    const earned = await this.watchAd('reroll');
    this.busy = false;
    if (!earned || this.state !== 'upgrade') return;
    this.runAds.reroll = true;
    w.rerolls++;
    this.rerollUpgrade();
  }

  // ───────────────────────── Death, continue & rewards ─────────────────────────

  continueOffer(): ContinueOffer {
    return {
      adAvailable: !this.runAds.revive,
      coins: this.runAds.revive ? reviveCost(REVIVE_COINS, this.paidRevives) : 0,
      diamonds: reviveCost(REVIVE_DIAMONDS, this.paidRevives),
    };
  }

  private openContinue(): void {
    this.state = 'continue';
    this.audio.duck(true);
    this.platform.keepAwake(false);
    this.ui.showContinue(this.continueOffer());
  }

  /** Revive via ad, shards or diamonds. Returns true if the run continues. */
  async continueWith(kind: 'ad' | Currency): Promise<boolean> {
    if (this.state !== 'continue' || !this.world || this.busy) return false;
    const offer = this.continueOffer();
    if (kind === 'ad') {
      if (!offer.adAvailable) return false;
      this.busy = true;
      const earned = await this.watchAd('revive');
      this.busy = false;
      if (!earned) {
        this.ui.toast(t('revive.title'), t('revive.adFailed'), 'play');
        return false;
      }
      this.runAds.revive = true;
    } else {
      const price = kind === 'coins' ? offer.coins : offer.diamonds;
      if (price <= 0 || !spend(this.save.data, kind, price)) {
        this.audio.denied();
        return false;
      }
      this.paidRevives++;
      this.save.save();
    }
    this.doRevive();
    return true;
  }

  private doRevive(): void {
    const w = this.world!;
    this.state = 'playing';
    this.ui.close();
    w.revive();
    this.ui.showBanner(t('revive.banner'));
    this.audio.duck(false);
    this.audio.setIntensity(w.plan?.boss ? 3 : w.wave >= 8 ? 2 : 1);
    this.input.reset();
    this.input.enabled = true;
    this.pendingDx = this.pendingDy = 0;
    this.platform.keepAwake(true);
    this.unlock('revived');
  }

  giveUp(): void {
    if (this.state !== 'continue') return;
    this.endRun();
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
    st.bestWave = Math.max(st.bestWave, r.wavesCleared);
    s.bank += r.shards;
    s.ads.runsSinceInterstitial++;

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
      s.bestWave = Math.max(s.bestWave, r.wavesCleared);
    }

    // Progression: experience, levels and missions.
    const xp = xpForRun({ score: r.score, kills: r.kills, wavesCleared: r.wavesCleared });
    const levelUps = addXp(s, xp);
    for (const lu of levelUps) {
      this.ui.toast(t('toast.levelUp'), `${t('level.up', { n: lu.level })} ${rewardText(lu.reward)}`, 'star');
      if (lu.level >= 10) this.unlock('level10');
      if (lu.level >= 25) this.unlock('level25');
    }
    ensureMissions(s, localDateKey());
    const done = progressMissions(s, {
      kills: r.kills,
      loops: r.loops,
      wave: r.wavesCleared,
      bestLoop: r.bestLoop,
      bosses: r.bossesKilled.length,
      shards: r.shards,
      pulses: r.pulses,
      maxCombo: r.maxCombo,
    });

    if (r.score >= 10000) this.unlock('score10k');
    if (r.score >= 50000) this.unlock('score50k');
    if (st.shardsTotal >= 1000) this.unlock('shards1000');
    this.save.save();

    const canAfford = META.some((m) => (s.meta[m.id] ?? 0) < m.max && s.bank >= metaCost(m, s.meta[m.id] ?? 0));
    this.ui.hud.show(false);
    this.audio.duck(true);
    this.audio.setIntensity(0);
    this.platform.keepAwake(false);
    this.lastResult = {
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
      xp,
      levelUps,
      milestones: [...this.runMilestones],
      missionsDone: done.length,
      canDouble: r.shards > 0,
    };
    this.ui.showGameOver(this.lastResult);
  }

  /** Rewarded ad at the end of a run: doubles the shards collected. */
  async doubleShards(): Promise<boolean> {
    const r = this.lastResult;
    if (!r || this.state !== 'gameover' || this.runAds.double || this.busy || r.shards <= 0) return false;
    this.busy = true;
    const earned = await this.watchAd('double');
    this.busy = false;
    if (!earned) return false;
    this.runAds.double = true;
    this.save.data.bank += r.shards;
    this.save.save();
    this.audio.purchase();
    return true;
  }

  /** Leaving the result screen is a natural break – the only place an interstitial may appear. */
  async afterRun(next: () => void): Promise<void> {
    if (this.busy) return;
    const s = this.save.data;
    const now = Date.now();
    const due =
      !s.owned.noAds &&
      !this.setup?.tutorial &&
      s.stats.runs >= INTERSTITIAL.minRuns &&
      s.ads.runsSinceInterstitial >= INTERSTITIAL.everyRuns &&
      now - s.ads.lastInterstitial >= INTERSTITIAL.minGapSec * 1000 &&
      now - s.ads.lastRewarded >= INTERSTITIAL.afterRewardedSec * 1000;
    if (due) {
      this.busy = true;
      s.ads.runsSinceInterstitial = 0;
      s.ads.lastInterstitial = now;
      this.save.save();
      this.audio.setVisible(false);
      try {
        await this.platform.showInterstitial();
      } finally {
        this.audio.setVisible(true);
        this.busy = false;
      }
    }
    next();
  }

  private async watchAd(placement: 'revive' | 'double' | 'reroll' | 'freeDiamonds'): Promise<boolean> {
    this.audio.setVisible(false);
    let earned = false;
    try {
      earned = await this.platform.showRewarded(placement);
    } catch {
      earned = false;
    } finally {
      this.audio.setVisible(true);
    }
    if (earned) {
      this.save.data.ads.lastRewarded = Date.now();
      this.save.save();
    }
    return earned;
  }

  // ───────────────────────── Economy actions ─────────────────────────

  buyMeta(id: MetaId, currency: Currency = 'coins'): boolean {
    const s = this.save.data;
    const def = getMeta(id);
    const lv = s.meta[id] ?? 0;
    const cost = metaCost(def, lv);
    const price = currency === 'coins' ? cost : diamondsForCoins(cost);
    if (lv >= def.max || !spend(s, currency, price)) {
      this.audio.denied();
      return false;
    }
    s.meta[id] = lv + 1;
    this.save.save();
    this.audio.purchase();
    this.haptics.buzz(25);
    return true;
  }

  buyChar(id: CharacterId, currency: Currency): boolean {
    const s = this.save.data;
    const c = getCharacter(id);
    const price = currency === 'coins' ? c.price : c.diamondPrice;
    if (s.chars.includes(id) || price <= 0 || (c.premium && currency === 'coins') || !spend(s, currency, price)) {
      this.audio.denied();
      return false;
    }
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

  exchange(index: number): boolean {
    const offer = EXCHANGE[index];
    const s = this.save.data;
    if (!offer || !spend(s, 'diamonds', offer.diamonds)) {
      this.audio.denied();
      return false;
    }
    s.bank += offer.coins;
    this.save.save();
    this.audio.purchase();
    return true;
  }

  freeDiamondsLeft(): number {
    return freeDiamondAdsLeft(this.save.data, localDateKey());
  }

  async freeDiamonds(): Promise<boolean> {
    if (this.freeDiamondsLeft() <= 0 || this.busy) return false;
    this.busy = true;
    const earned = await this.watchAd('freeDiamonds');
    this.busy = false;
    if (!earned) return false;
    countFreeDiamondAd(this.save.data, localDateKey());
    grant(this.save.data, { diamonds: FREE_DIAMOND_AD_REWARD });
    this.save.save();
    this.audio.purchase();
    this.ui.toast(t('shop.free'), t('toast.diamonds', { n: FREE_DIAMOND_AD_REWARD }), 'gem');
    return true;
  }

  claimMission(index: number): boolean {
    const r = claimMission(this.save.data, index);
    if (!r) return false;
    this.save.save();
    this.audio.purchase();
    return true;
  }

  claimMissionBonus(): boolean {
    if (!canClaimMissionBonus(this.save.data)) return false;
    claimMissionBonus(this.save.data);
    this.save.save();
    this.audio.purchase();
    return true;
  }

  private offerDailyLogin(): void {
    if (this.state !== 'menu' || !this.save.data.tutorialDone) return;
    const today = localDateKey();
    const day = loginDayToClaim(this.save.data, today);
    if (day === null) return;
    this.ui.showLogin(day, () => {
      const reward = claimLogin(this.save.data, today);
      if (reward) {
        this.save.save();
        this.audio.purchase();
        this.haptics.buzz(30);
      }
      if (this.ui.screenName === 'menu') this.ui.showMenu();
    });
  }

  // ───────────────────────── Purchases ─────────────────────────

  priceOf(id: ProductId): string {
    return this.products.find((p) => p.id === id)?.price ?? getProduct(id).fallbackPrice;
  }

  async buyProduct(id: ProductId): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    let outcome;
    try {
      outcome = await this.platform.purchase(id, (p) => void this.credit(p));
    } finally {
      this.busy = false;
    }
    if (outcome === 'pending') this.ui.toast(t('shop.title'), t('shop.pending'), 'gem');
    else if (outcome === 'error') this.ui.toast(t('shop.title'), t('shop.error'), 'gem');
    else if (outcome === 'unavailable') this.ui.toast(t('shop.title'), t('shop.unavailable'), 'gem');
  }

  /** Credits a paid purchase exactly once, saves, then lets the store consume/acknowledge it. */
  private async credit(p: CompletedPurchase): Promise<void> {
    const s = this.save.data;
    if (creditPurchase(s, p.productId, p.token)) {
      const def = getProduct(p.productId);
      this.save.save();
      this.audio.purchase();
      this.haptics.buzz([30, 40, 60]);
      this.ui.toast(t('shop.thanks'), `${t(`shop.product.${p.productId}` as I18nKey)} ${rewardText(def.reward)}`, 'gem');
      this.unlock('shopper');
      this.ui.refresh();
    }
    try {
      await p.finish();
    } catch {
      /* retried on next launch via recoverPurchases */
    }
  }

  /** Restores one-time purchases (no ads, starter spark) – never currency. */
  async restoreEntitlements(silent = false): Promise<void> {
    const owned = await this.platform.ownedProducts();
    const s = this.save.data;
    let changed = false;
    if (owned.includes('no_ads') && !s.owned.noAds) {
      s.owned.noAds = true;
      changed = true;
    }
    if (owned.includes('starter_pack')) {
      if (!s.owned.starter) {
        s.owned.starter = true;
        changed = true;
      }
      if (!s.chars.includes('nova')) {
        s.chars.push('nova');
        changed = true;
      }
    }
    if (changed) {
      this.save.save();
      this.ui.refresh();
    }
    if (!silent) this.ui.toast(t('shop.title'), t(changed || owned.length ? 'shop.restored' : 'shop.nothingToRestore'), 'refresh');
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
    const d = achievementDiamonds(id);
    s.diamonds += d;
    this.newAch.push(id);
    this.save.save();
    this.ui.toast(t('ach.unlocked'), `${t(`ach.${id}.name` as I18nKey)} · ${t('toast.diamonds', { n: d })}`);
    this.audio.achievement();
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

    const frozen = this.state === 'paused' || this.state === 'continue';
    this.fx.update(frozen ? 0 : rdt * (this.state === 'playing' || this.state === 'dying' ? Math.max(0.3, this.timeScale) : 1));

    const dimTarget =
      this.state === 'menu' ? 0.12 : frozen || this.state === 'upgrade' ? 0.35 : this.state === 'gameover' ? 0.45 : 0;
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
      this.dyingTimer = 1.2;
      this.input.enabled = false;
    }
    if (this.state === 'dying') {
      this.dyingTimer -= rdt;
      if (this.dyingTimer <= 0) this.openContinue();
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
        case 'blocked':
          this.audio.blocked();
          break;
        case 'blink':
          this.audio.blink();
          break;
        case 'bombArmed':
          this.audio.fuse();
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
          if (this.state === 'playing' && w.secondWindUsed && w.run.revives === 0) this.ui.showBanner(t('banner.revive'));
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
          this.audio.spawnWarn(e.enemy === 'maw' || e.enemy === 'weaver' || e.enemy === 'twin' || e.enemy === 'hydra' || e.enemy === 'eye');
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
        case 'waveStart': {
          this.audio.waveStart(!!e.boss);
          const biome = biomeForWave(e.wave);
          this.renderer.setBiome(biome);
          const newRegion = e.wave > 1 && (e.wave - 1) % 10 === 0;
          if (e.boss) {
            const type = e.boss === 'twins' ? 'twin' : e.boss;
            this.ui.showBanner(t('banner.bossWave', { n: e.wave }), `<b>${t(`enemy.${type}` as I18nKey)}</b> – ${t(`hint.${type}` as I18nKey)}`, true, 2600);
            this.audio.setIntensity(3);
          } else if (newRegion) {
            this.ui.showBanner(t(`biome.${BIOMES[biome].id}` as I18nKey), `${t('banner.biome')} · ${t('banner.wave', { n: e.wave })}`, false, 2600);
            this.audio.setIntensity(e.wave >= 8 ? 2 : 1);
          } else {
            this.ui.showBanner(t('banner.wave', { n: e.wave }), e.newEnemy ? this.ui.newEnemyText(e.newEnemy) : '', false, e.newEnemy ? 2800 : 1900);
            this.audio.setIntensity(e.wave >= 8 ? 2 : 1);
          }
          break;
        }
        case 'waveClear': {
          this.audio.waveClear(e.flawless);
          this.haptics.buzz(25);
          this.ui.showBanner(t('banner.cleared'), e.flawless ? t('banner.flawless') : '', false, 1500);
          if (e.wave >= 5) this.unlock('wave5');
          if (e.wave >= 10) this.unlock('wave10');
          if (e.wave >= 15) this.unlock('wave15');
          if (e.wave >= 20) this.unlock('wave20');
          if (e.wave >= 30) this.unlock('wave30');
          if (e.wave >= 50) this.unlock('wave50');
          if (e.wave >= 5 && w.run.damageTaken === 0) this.unlock('flawless5');
          if (w.run.score >= 10000) this.unlock('score10k');
          if (w.run.score >= 50000) this.unlock('score50k');
          if (!w.opts.tutorial) {
            const d = claimMilestone(this.save.data, e.wave);
            if (d > 0) {
              this.runMilestones.push({ wave: e.wave, diamonds: d });
              this.save.save();
              this.ui.toast(t('toast.milestone'), `${t('milestones.wave', { n: e.wave })} · ${t('toast.diamonds', { n: d })}`, 'gem');
            }
          }
          if (e.boss) this.audio.setIntensity(1);
          break;
        }
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
          const ach: Record<BossType, AchievementId> = {
            maw: 'boss_maw',
            weaver: 'boss_weaver',
            twins: 'boss_twins',
            hydra: 'boss_hydra',
            eye: 'boss_eye',
          };
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

/** "+300 ◆ +5 ◇" style summary used in toasts. */
export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`+${r.coins.toLocaleString()} ${t('currency.coins')}`);
  if (r.diamonds) parts.push(`+${r.diamonds.toLocaleString()} ${t('currency.diamonds')}`);
  return parts.join(' · ');
}

import { clamp, damp } from './core/math';
import { dailySeed, localDateKey, randomSeed } from './core/rng';
import { SaveStore } from './core/storage';
import { detectLang, fmt, setLang, t, type I18nKey } from './core/i18n';
import { BIOMES, TUNING, biomeForWave } from './game/config';
import { World } from './game/world';
import { getCharacter, CHARACTERS } from './game/characters';
import { getTrail, type TrailId } from './game/trails';
import { getMode, type GameMode } from './game/modes';
import { META_VALUES, metaCost, metaLevelReq, getMeta } from './game/meta';
import { anyMetaBuyable, unlocksBetween, type Unlock } from './economy/unlocks';
import { PASS_BONUS_XP, PASS_MISSION_XP, addPassXp, claimAllPass, claimPass, ensureSeason, passTier, passXpForRun, type PassTrack } from './economy/pass';
import { ensureWeek, recordWeekly, weekOf, weeklyTheme } from './economy/weekly';
import { addMastery, sparkMastery, MASTERY_MAX } from './economy/mastery';
import { decodeChallenge, encodeChallenge } from './economy/challenge';
import { getLevel, starsFor, WORLDS, LEVEL_COUNT } from './game/campaign';
import { levelUnlocked, recordLevel } from './economy/campaign';
import { cloudLabel, compareProgress, mergeForImport, packCloud, unpackCloud, type CloudSave } from './economy/cloud';
import { getUpgrade } from './game/upgrades';
import { dailySetup, type DailySetup } from './game/modifiers';
import type { AchievementId } from './game/achievements';
import type { BossType, CharacterId, GameEvent, MetaId, ModifierId, UpgradeId } from './game/types';
import { Renderer, type ArenaRect } from './render/renderer';
import { Fx } from './render/fx';
import { PostFx, type SceneParams } from './render/postfx';
import { AudioEngine } from './audio/audio';
import { Haptics } from './haptics';
import { Input } from './input';
import { UI } from './ui/ui';
import { Tutorial } from './tutorial';
import { createPlatform, type Platform } from './platform';
import { WebPlatform } from './platform/web';
import { GameServices } from './platform/games';
import type { CompletedPurchase, RewardResult, StoreProduct } from './platform/types';
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
  /** Content unlocked by this run's level-ups. */
  unlocked: Unlock[];
  /** Light pass tier after the run and tiers gained in it. */
  pass: { tier: number; gained: number; xp: number };
  mode: GameMode;
  /** Blitz run that ended because the time ran out. */
  timeUp: boolean;
  weekly: boolean;
  /** Weekly goals reached in this run (0 = bronze … 2 = gold). */
  weeklyGoals: number[];
  /** Mastery of the spark played: level after the run and levels reached in it. */
  mastery: { spark: CharacterId; level: number; gained: number[] };
  /** Code a friend can use to play exactly this run (none for daily, weekly and tutorial runs). */
  shareCode: string | null;
  /** Result of a friend challenge. */
  challenge: { target: number; won: boolean } | null;
  /** Campaign level result. */
  campaign: { level: number; victory: boolean; stars: [boolean, boolean, boolean]; gained: number; reward: { coins?: number; diamonds?: number } } | null;
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
  /** Weekly event run. */
  weekly: boolean;
  /** Friend challenge: the score to beat (same seed, spark and mode as the friend). */
  challenge?: { score: number };
  /** Campaign level index. */
  campaign?: number;
  mode: GameMode;
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
/** Gap between fingertip and spark in direct touch mode (CSS px ≈ dp: about 9, 13 and 18 mm). */
const TOUCH_OFFSET = { small: 56, medium: 80, large: 112 } as const;

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
  /** Latest finger position (CSS px) not yet applied – direct touch mode. */
  private pendingPoint: { x: number; y: number } | null = null;
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
  private pricesLoading = false;
  /** Live demo behind the main menu: a bot catching shadows. */
  /** Google Play Games (leaderboards, achievements) – a no-op until configured. */
  games!: GameServices;
  /** WebGL light filter over the 2D frame (null when WebGL2 is not available). */
  private post: PostFx | null = null;
  private postActive = false;
  private demo: World | null = null;
  private demoVisible = false;
  private demoAcc = 0;
  private demoAngle = 0;
  private lastPx = 0;
  private lastPy = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.post = PostFx.create(canvas);
    if (this.post) this.post.onLost = () => this.updatePostFx();
    this.ui = new UI(this);
    this.input = new Input(canvas, {
      drag: (dx, dy) => {
        this.pendingDx += dx;
        this.pendingDy += dy;
      },
      point: (x, y) => {
        this.pendingPoint = { x, y };
      },
      pulse: () => this.pulse(),
      pause: () => this.pause(),
      gesture: () => this.audio.unlock(),
    });
    this.haptics.sink = (p) => this.platform.vibrate(p);
    this.games = new GameServices(this.platform.native);
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
    ensureSeason(this.save.data, localDateKey());
    ensureWeek(this.save.data, localDateKey());
    this.save.save();
    this.startDemo();
    this.ui.showMenu();
    this.audio.setIntensity(0);
    requestAnimationFrame(this.loop);

    // Store data loads in the background; purchases that were paid but not yet credited are recovered.
    void this.platform.getProducts().then((p) => (this.products = p));
    void this.platform.recoverPurchases((p) => void this.credit(p));
    void this.restoreEntitlements(true);
    this.save.onSave = () => this.scheduleCloudSave();
    void this.games.init().then(() => this.onSignedIn());
    this.afterUpdate();
  }

  /** Shows the "What's new" notes once per app version to returning players, then the daily login. */
  private afterUpdate(): void {
    const s = this.save.data;
    const returning = s.tutorialDone && s.stats.runs > 0;
    const fresh = s.seenVersion !== __APP_VERSION__;
    if (fresh) {
      s.seenVersion = __APP_VERSION__;
      this.save.save();
    }
    setTimeout(() => {
      if (fresh && returning && this.state === 'menu') this.ui.showWhatsNew(() => this.offerDailyLogin());
      else this.offerDailyLogin();
    }, 700);
  }

  private setActive(active: boolean): void {
    this.audio.setVisible(active);
    if (!active) {
      if (this.state === 'playing') this.pause();
      this.save.save();
      if (this.cloudTimer) void this.uploadCloud();
    } else {
      if (this.state === 'playing') this.platform.keepAwake(true);
      // Android keeps apps alive for days: a new day must still bring new missions and the login bonus.
      this.refreshDay();
    }
  }

  /** Rolls over daily content (missions, login bonus) when the calendar day changed. */
  refreshDay(): void {
    ensureMissions(this.save.data, localDateKey());
    ensureSeason(this.save.data, localDateKey());
    ensureWeek(this.save.data, localDateKey());
    this.save.save();
    if (this.state === 'menu') this.offerDailyLogin();
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
    this.post?.resize();
    this.updatePostFx();
    const s = this.readSafe();
    this.arena = {
      x: s.l + 8,
      y: s.t + HUD_TOP,
      w: Math.max(100, w - s.l - s.r - 16),
      h: Math.max(100, h - s.t - HUD_TOP - s.b - 10),
    };
    const shown = this.world ?? this.demo;
    if (shown) this.renderer.layout(shown.w, shown.h, this.arena);
  }

  /**
   * Direct touch mode: the spark sits a fixed distance above the fingertip so the thumb never
   * covers it. Near the top and bottom edge the gap shrinks smoothly, so every spot stays reachable.
   */
  private fingerToWorld(x: number, y: number, w: World): { x: number; y: number } {
    const r = this.renderer;
    const gap = TOUCH_OFFSET[this.save.data.settings.offset];
    const top = r.oy;
    const bottom = r.oy + w.h * r.scale;
    const ease = clamp(Math.min(y - top, bottom - y) / (2 * gap), 0, 1);
    return { x: (x - r.ox) / r.scale, y: (y - gap * ease - r.oy) / r.scale };
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
    this.updatePostFx();
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
  startRun(daily: boolean, weekly = false): void {
    if (!this.save.data.tutorialDone && !daily && !weekly) {
      this.startTutorial();
      return;
    }
    this.toMenuState();
    this.ui.showPrerun(daily, weekly);
  }

  /** Starts a campaign level (with the selected spark, no boosters). */
  startLevel(index: number): boolean {
    const s = this.save.data;
    if (index < 0 || index >= LEVEL_COUNT || !levelUnlocked(s, index)) {
      this.audio.denied();
      return false;
    }
    const lv = getLevel(index);
    this.audio.uiSelect();
    this.toMenuState();
    this.begin({
      daily: false,
      weekly: false,
      campaign: index,
      mode: 'normal',
      tutorial: false,
      character: s.selected,
      modifiers: [...lv.modifiers],
      seed: 7919 * (index + 1),
      boosters: [],
    });
    return true;
  }

  /** "Again" after a run or from the pause menu: the same kind of run as before. */
  replay(): void {
    const s = this.setup;
    if (!s || s.tutorial) {
      if (s?.tutorial) this.startTutorial();
      else this.startRun(false);
      return;
    }
    if (s.campaign !== undefined) this.startLevel(s.campaign);
    else if (s.challenge) this.startChallenge(encodeChallenge({ seed: s.seed, character: s.character, mode: s.mode, score: s.challenge.score }));
    else this.startRun(s.daily, s.weekly);
  }

  /** Starts a friend challenge from a code. Returns false when the code is not valid. */
  startChallenge(code: string): boolean {
    const c = decodeChallenge(code);
    if (!c) {
      this.audio.denied();
      return false;
    }
    this.audio.uiSelect();
    this.toMenuState();
    // Same seed, spark and mode as the friend, and no boosters – a fair duel.
    this.begin({
      daily: false,
      weekly: false,
      challenge: { score: c.score },
      mode: c.mode,
      tutorial: false,
      character: c.character,
      modifiers: [...getMode(c.mode).modifiers],
      seed: c.seed,
      boosters: [],
    });
    return true;
  }

  /** Shares the last run as a challenge code. */
  async shareRun(): Promise<void> {
    const r = this.lastResult;
    if (!r?.shareCode) return;
    const text = t('challenge.shareText', { n: fmt(r.score), code: r.shareCode });
    const result = await this.platform.share(text);
    if (result === 'copied') this.ui.toast(t('challenge.title'), t('challenge.copied'), 'check');
    else if (result === 'failed') this.ui.toast(t('challenge.title'), r.shareCode, 'check');
  }

  /** Called by the preparation screen. Pays for the boosters and starts the run. */
  launchRun(daily: boolean, boosters: BoosterId[], mode: GameMode = 'normal', weekly = false): boolean {
    const s = this.save.data;
    const m = getMode(daily || weekly ? 'normal' : mode);
    if (m.unlockLevel > s.level) {
      this.audio.denied();
      return false;
    }
    const allowed = availableBoosters(s).map((b) => b.id);
    const chosen = boosters.filter((b) => allowed.includes(b));
    if (!payBoosters(s, chosen)) {
      this.audio.denied();
      return false;
    }
    s.boosters = chosen;
    this.save.save();
    const d = daily ? this.dailyInfo() : null;
    if (!daily && !weekly) s.mode = m.id;
    const theme = weekly ? weeklyTheme(weekOf(localDateKey())) : null;
    this.begin({
      daily,
      weekly,
      mode: m.id,
      tutorial: false,
      character: d ? d.character : s.selected,
      modifiers: d ? d.modifiers : theme ? [...theme.modifiers] : [...m.modifiers],
      seed: d ? d.seed : randomSeed(),
      boosters: chosen,
    });
    return true;
  }

  startTutorial(): void {
    this.begin({ daily: false, weekly: false, mode: 'normal', tutorial: true, character: this.save.data.selected, modifiers: [], seed: 1, boosters: [] });
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
    this.demo = null;
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
      level: this.save.data.level,
      timeLimit: getMode(setup.mode).timeLimit || undefined,
      mastery: setup.tutorial ? 0 : sparkMastery(this.save.data, setup.character),
      script: setup.campaign !== undefined ? getLevel(setup.campaign).waves : undefined,
    });
    this.world = world;
    this.renderer.layout(world.w, world.h, this.arena);
    this.renderer.setBiome(setup.campaign !== undefined ? WORLDS[getLevel(setup.campaign).world].biome : 0);
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
    this.pendingPoint = null;
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
    this.pendingPoint = null;
    this.acc = 0;
    // A short grace period so resuming never causes an instant hit.
    this.world.invuln = Math.max(this.world.invuln, 0.8);
    this.platform.keepAwake(true);
  }

  restart(): void {
    this.replay();
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
    this.audio.setRegion(-1);
    this.platform.keepAwake(false);
    this.startDemo();
    if (this.pendingCloud) window.setTimeout(() => this.offerCloud(), 500);
  }

  quitToMenu(): void {
    this.toMenuState();
    this.ui.showMenu();
    this.refreshDay();
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
    if (getUpgrade(id).rarity === 'legendary') this.unlock('legend');
    if (id === 'galaxy') this.unlock('galaxy');
    w.nextWave();
    this.state = 'playing';
    this.ui.close();
    this.audio.duck(false);
    this.input.reset();
    this.input.enabled = true;
    this.pendingDx = this.pendingDy = 0;
    this.pendingPoint = null;
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
    const earned = (await this.watchAd('reroll')) === 'earned';
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
      const result = await this.watchAd('revive');
      this.busy = false;
      // One try per run: an ad that was cut short or could not load is used up as well,
      // and the shard option appears (the player is never stuck with diamonds only).
      if (result !== 'earned') this.runAds.revive = true;
      // The dialog may have been closed meanwhile (give up / countdown) – never revive a finished run.
      if (result !== 'earned' || this.state !== 'continue') return false;
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
    this.pendingPoint = null;
    this.platform.keepAwake(true);
    this.unlock('revived');
  }

  giveUp(): void {
    // Not while an ad for this very dialog is still running.
    if (this.state !== 'continue' || this.busy) return;
    this.endRun();
  }

  private endRun(): void {
    this.ui.clearBanner();
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
    let weeklyGoals: number[] = [];
    if (setup.weekly) {
      const before = s.weekly.best;
      weeklyGoals = recordWeekly(s, r.score, localDateKey());
      newBest = r.score > before && r.score > 0;
    } else if (setup.daily) {
      const date = this.dailyInfo().date;
      if (s.daily.date !== date) {
        s.daily = { date, best: r.score };
        newBest = r.score > 0;
      } else if (r.score > s.daily.best) {
        s.daily.best = r.score;
        newBest = true;
      }
      this.unlock('daily');
    } else if (setup.challenge || setup.campaign !== undefined) {
      // Friend challenges and campaign levels are fixed runs – they never count as records.
    } else if (setup.mode !== 'normal') {
      // Extra modes keep their own records.
      const key = setup.mode;
      if (r.score > s.modeBest[key]) {
        s.modeBest[key] = r.score;
        newBest = r.score > 0;
      }
      if (key === 'blitz' && r.score >= 10000) this.unlock('blitz');
      if (key === 'bosses' && r.bossesKilled.length >= 5) this.unlock('hunter');
    } else {
      if (r.score > s.best) {
        s.best = r.score;
        newBest = true;
      }
      s.bestWave = Math.max(s.bestWave, r.wavesCleared);
    }

    // Progression: experience, levels and missions.
    const xp = Math.round(xpForRun({ score: r.score, kills: r.kills, wavesCleared: r.wavesCleared }) * (1 + META_VALUES.wisdom(s.meta.wisdom ?? 0)));
    const levelBefore = s.level;
    const levelUps = addXp(s, xp);
    const unlocked = unlocksBetween(levelBefore, s.level);
    const passXp = passXpForRun(r.wavesCleared);
    const passGained = addPassXp(s, passXp, localDateKey());
    const masteryGained = s.chars.includes(setup.character) ? addMastery(s, setup.character, xp) : [];
    let campaignResult: RunResult['campaign'] = null;
    if (setup.campaign !== undefined) {
      const stars = starsFor(getLevel(setup.campaign), w.victory, r.damageTaken, r.score);
      const { gained, reward } = recordLevel(s, setup.campaign, stars);
      campaignResult = { level: setup.campaign, victory: w.victory, stars, gained, reward };
      if (s.campaign.filter((v) => v > 0).length >= LEVEL_COUNT) this.unlock('campaign');
      if (s.campaign.filter((v) => v >= 3).length >= LEVEL_COUNT) this.unlock('allstars');
    }
    if (sparkMastery(s, setup.character) >= MASTERY_MAX) this.unlock('master');
    // Level-ups are listed on the result screen – no extra toasts on top of it.
    if (s.level >= 10) this.unlock('level10');
    if (s.level >= 25) this.unlock('level25');
    if (s.level >= 50) this.unlock('level50');
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

    // Leaderboards: each mode reports into its own board.
    if (setup.challenge || setup.campaign !== undefined) {
      /* no leaderboard entries for fixed runs */
    } else if (setup.weekly) this.games.submit('weekly', r.score);
    else if (!setup.daily && setup.mode === 'normal') {
      this.games.submit('score', r.score);
      this.games.submit('wave', r.wavesCleared);
    } else if (!setup.daily && setup.mode !== 'normal') this.games.submit(setup.mode, r.score);
    const canAfford = anyMetaBuyable(s);
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
      unlocked,
      pass: { tier: passTier(s.pass.points), gained: passGained, xp: passXp },
      mode: setup.mode,
      timeUp: w.timeUp,
      weekly: setup.weekly,
      weeklyGoals,
      mastery: { spark: setup.character, level: sparkMastery(s, setup.character), gained: masteryGained },
      shareCode: setup.daily || setup.weekly || setup.tutorial || setup.campaign !== undefined ? null : encodeChallenge({ seed: setup.seed, character: setup.character, mode: setup.mode, score: r.score }),
      challenge: setup.challenge ? { target: setup.challenge.score, won: r.score > setup.challenge.score } : null,
      campaign: campaignResult,
      milestones: [...this.runMilestones],
      missionsDone: done.length,
      canDouble: r.shards > 0,
    };
    this.ui.showGameOver(this.lastResult);
    if (newBest && !setup.daily && !setup.weekly && !setup.challenge) this.maybeAskForReview();
  }

  /**
   * After a new record – a good moment – ask Google Play for its rating dialog. Not before the 8th run,
   * at most three times and at least 30 days apart. Google may still decide not to show it.
   */
  private maybeAskForReview(): void {
    const s = this.save.data;
    const now = Date.now();
    if (!this.platform.native || s.stats.runs < 8 || s.review.count >= 3 || now - s.review.last < 30 * 86_400_000) return;
    s.review = { last: now, count: s.review.count + 1 };
    this.save.save();
    window.setTimeout(() => {
      if (this.state === 'gameover') void this.platform.requestReview();
    }, 1800);
  }

  /** Rewarded ad at the end of a run: doubles the shards collected. */
  async doubleShards(): Promise<boolean> {
    const r = this.lastResult;
    if (!r || this.state !== 'gameover' || this.runAds.double || this.busy || r.shards <= 0) return false;
    this.busy = true;
    const earned = (await this.watchAd('double')) === 'earned';
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

  /** Shows a rewarded ad with a loading hint; tells the player when no ad is available. */
  private async watchAd(placement: 'revive' | 'double' | 'reroll' | 'freeDiamonds'): Promise<RewardResult> {
    this.audio.setVisible(false);
    // Loading an ad can take a moment on a slow connection – show that something is happening.
    const hint = this.platform.native ? window.setTimeout(() => this.ui.loading(true), 250) : 0;
    let result: RewardResult = 'unavailable';
    try {
      result = await this.platform.showRewarded(placement);
    } catch {
      result = 'unavailable';
    } finally {
      clearTimeout(hint);
      this.ui.loading(false);
      this.audio.setVisible(true);
    }
    if (result === 'earned') {
      this.save.data.ads.lastRewarded = Date.now();
      this.save.save();
    } else if (result === 'unavailable') {
      this.ui.toast(t('ads.title'), t('ads.unavailable'), 'ad');
    }
    return result;
  }

  // ───────────────────────── Economy actions ─────────────────────────

  buyMeta(id: MetaId, currency: Currency = 'coins'): boolean {
    const s = this.save.data;
    const def = getMeta(id);
    const lv = s.meta[id] ?? 0;
    const cost = metaCost(def, lv);
    const price = currency === 'coins' ? cost : diamondsForCoins(cost);
    if (lv >= def.max || metaLevelReq(def, lv) > s.level || !spend(s, currency, price)) {
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
    if (
      s.chars.includes(id) ||
      c.exclusive ||
      price <= 0 ||
      c.unlockLevel > s.level ||
      (c.premium && currency === 'coins') ||
      !spend(s, currency, price)
    ) {
      this.audio.denied();
      return false;
    }
    s.chars.push(id);
    s.selected = id;
    this.save.save();
    this.audio.purchase();
    this.haptics.buzz(25);
    this.checkAllChars();
    return true;
  }

  /** "Collector": every spark that can be earned in-game (store exclusives don't count). */
  private checkAllChars(): void {
    const s = this.save.data;
    if (CHARACTERS.every((ch) => ch.exclusive || s.chars.includes(ch.id))) this.unlock('all_chars');
  }

  /** Claims one light pass reward. */
  claimPassTier(tier: number, track: PassTrack): boolean {
    const r = claimPass(this.save.data, tier, track);
    if (!r) {
      this.audio.denied();
      return false;
    }
    this.save.save();
    this.audio.purchase();
    this.haptics.buzz(20);
    return true;
  }

  /** Claims every light pass reward that is ready. */
  claimAllPassRewards(): boolean {
    const sum = claimAllPass(this.save.data);
    if (!sum.coins && !sum.diamonds && sum.trails.length === 0) return false;
    this.save.save();
    this.audio.purchase();
    this.haptics.buzz([20, 30, 40]);
    return true;
  }

  /** Selects an owned trail design or buys it with diamonds. */
  pickTrail(id: TrailId): boolean {
    const s = this.save.data;
    const def = getTrail(id);
    if (!s.trails.includes(id)) {
      if (def.price <= 0 || !spend(s, 'diamonds', def.price)) {
        this.audio.denied();
        return false;
      }
      s.trails.push(id);
      this.audio.purchase();
      this.haptics.buzz(25);
    } else {
      this.audio.uiSelect();
    }
    s.trail = id;
    this.save.save();
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
    const earned = (await this.watchAd('freeDiamonds')) === 'earned';
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
    addPassXp(this.save.data, PASS_MISSION_XP, localDateKey());
    this.save.save();
    this.audio.purchase();
    return true;
  }

  claimMissionBonus(): boolean {
    if (!canClaimMissionBonus(this.save.data)) return false;
    claimMissionBonus(this.save.data);
    addPassXp(this.save.data, PASS_BONUS_XP, localDateKey());
    this.save.save();
    this.audio.purchase();
    return true;
  }

  private offerDailyLogin(): void {
    if (this.state !== 'menu' || !this.save.data.tutorialDone || document.querySelector('.dialog.login')) return;
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

  /** Re-queries store prices (e.g. billing was not ready at start-up); re-renders the shop if they changed. */
  refreshPrices(): void {
    if (!this.platform.native || this.pricesLoading) return;
    this.pricesLoading = true;
    void this.platform
      .getProducts()
      .then((p) => {
        const changed = JSON.stringify(p) !== JSON.stringify(this.products);
        this.products = p;
        if (changed && this.ui.screenName === 'shop') this.ui.showShop();
      })
      .finally(() => (this.pricesLoading = false));
  }

  priceOf(id: ProductId): string {
    return this.products.find((p) => p.id === id)?.price ?? getProduct(id).fallbackPrice;
  }

  /**
   * Real-money value of a diamond amount, based on the smallest diamond pack (store price when known).
   * Shown next to every diamond price so players always see what something costs.
   */
  diamondValue(diamonds: number): string {
    const pack = getProduct('diamonds_80');
    const store = this.products.find((p) => p.id === pack.id);
    const packPrice = store?.amount ?? 0.99;
    const currency = store?.currency ?? 'EUR';
    const value = (packPrice / (pack.reward.diamonds ?? 80)) * diamonds;
    try {
      return new Intl.NumberFormat(this.lang === 'de' ? 'de-DE' : 'en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency}`;
    }
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
      // A bought spark is selected right away.
      if (def.unlocks && def.id !== 'starter_pack') s.selected = def.unlocks;
      this.save.save();
      this.audio.purchase();
      this.haptics.buzz([30, 40, 60]);
      this.ui.toast(t('shop.thanks'), `${t(`shop.product.${p.productId}` as I18nKey)} ${rewardText(def.reward)}`, 'gem');
      this.unlock('shopper');
      this.checkAllChars();
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
    if (owned.includes('starter_pack') && !s.owned.starter) {
      s.owned.starter = true;
      changed = true;
    }
    // Sparks that came with a store purchase (starter pack, exclusives).
    for (const id of owned) {
      const unlock = getProduct(id).unlocks;
      if (unlock && !s.chars.includes(unlock)) {
        s.chars.push(unlock);
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
    // A fresh save must not overwrite the cloud copy unasked: check again, which offers the cloud copy.
    this.cloudReady = false;
    this.cloudChecked = false;
    void this.cloudCheck();
  }

  // ───────────────────────── Cloud save ─────────────────────────

  /** Uploads are allowed only after the cloud copy was checked (and the player chose, if needed). */
  private cloudReady = false;
  private cloudChecked = false;
  private cloudTimer = 0;
  private pendingCloud: CloudSave | null = null;
  /** Time of the last successful upload (0 = not yet in this session). */
  cloudSavedAt = 0;

  /** Called once Play Games reports a signed-in player (at launch or after signing in from the settings). */
  onSignedIn(): void {
    if (!this.games.signedIn) return;
    this.syncGames();
    if (!this.cloudChecked) void this.cloudCheck();
  }

  private async cloudCheck(): Promise<void> {
    if (!this.games.signedIn || this.cloudChecked) return;
    this.cloudChecked = true;
    const text = await this.games.loadSave();
    if (text === null) {
      // Could not read the cloud copy: try again next time, never overwrite it blindly.
      this.cloudChecked = false;
      return;
    }
    const cloud = text ? unpackCloud(text) : null;
    if (cloud && compareProgress(cloud.save, this.save.data) > 0) {
      this.pendingCloud = cloud;
      if (this.state === 'menu') this.offerCloud();
      return;
    }
    this.cloudReady = true;
    await this.uploadCloud();
  }

  /** Asks whether to load the cloud copy (only in the menu, never during a run). */
  private offerCloud(): void {
    const cloud = this.pendingCloud;
    if (!cloud || this.state !== 'menu') return;
    this.pendingCloud = null;
    if (compareProgress(cloud.save, this.save.data) <= 0) {
      this.cloudReady = true;
      void this.uploadCloud();
      return;
    }
    this.ui.showCloudChoice(this.save.data, cloud, (useCloud) => {
      if (useCloud) {
        this.ui.closeDialogs();
        this.save.replace(mergeForImport(this.save.data, cloud.save));
        this.applySettings(false);
        this.refreshDay();
        this.ui.toast(t('cloud.title'), t('cloud.loaded'), 'cloud');
        if (this.state === 'menu') this.ui.showMenu();
      }
      this.cloudReady = true;
      void this.uploadCloud();
    });
  }

  /** Every local save schedules one upload a little later, so a burst of changes becomes one write. */
  private scheduleCloudSave(): void {
    if (!this.cloudReady || this.cloudTimer) return;
    this.cloudTimer = window.setTimeout(() => void this.uploadCloud(), 20_000);
  }

  async uploadCloud(): Promise<boolean> {
    window.clearTimeout(this.cloudTimer);
    this.cloudTimer = 0;
    if (!this.cloudReady || !this.games.signedIn) return false;
    const s = this.save.data;
    const ok = await this.games.saveSave(packCloud(s, Date.now()), cloudLabel(s));
    if (ok) this.cloudSavedAt = Date.now();
    return ok;
  }

  /** "Save now" in the settings (menu only): signs in first if needed. 'ask' = the cloud choice is open. */
  async cloudSaveNow(): Promise<'saved' | 'failed' | 'ask'> {
    if (!this.games.signedIn && !(await this.games.signIn())) return 'failed';
    this.syncGames();
    if (!this.cloudReady) {
      await this.cloudCheck();
      if (!this.cloudReady) return this.cloudChecked ? 'ask' : 'failed';
      return this.cloudSavedAt > 0 ? 'saved' : 'failed';
    }
    return (await this.uploadCloud()) ? 'saved' : 'failed';
  }

  install(): void {
    const ev = this.installEvent;
    if (!ev) return;
    this.installEvent = null;
    this.canInstall = false;
    void ev.prompt().catch(() => undefined);
    if (this.ui.screenName === 'menu') this.ui.showMenu();
  }

  /** Pushes records and unlocked achievements to Play Games (after sign-in; both calls are idempotent). */
  syncGames(): void {
    if (!this.games.signedIn) return;
    const s = this.save.data;
    this.games.submit('score', s.best);
    this.games.submit('wave', s.bestWave);
    this.games.submit('blitz', s.modeBest.blitz);
    this.games.submit('bosses', s.modeBest.bosses);
    if (s.weekly.week === weekOf(localDateKey())) this.games.submit('weekly', s.weekly.best);
    for (const id of Object.keys(s.ach) as AchievementId[]) this.games.unlock(id);
  }

  private unlock(id: AchievementId): void {
    const s = this.save.data;
    if (s.ach[id]) return;
    s.ach[id] = Date.now();
    this.games.unlock(id);
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
    // The demo run plays only behind the main menu; content screens (shop, workshop …) get calm motes.
    const demoVisible = this.state === 'menu' && !!this.demo && this.ui.screenName === 'menu';
    if (demoVisible !== this.demoVisible) {
      this.demoVisible = demoVisible;
      this.fx.clear();
    }
    this.fx.calm = this.state === 'menu';
    if (this.state === 'menu') {
      if (demoVisible) this.stepDemo(rdt);
      else this.fx.ambient(this.renderer.cssW, this.renderer.cssH);
    }
    this.emitTrailSparks();

    const frozen = this.state === 'paused' || this.state === 'continue';
    this.fx.update(frozen ? 0 : rdt * (this.state === 'playing' || this.state === 'dying' ? Math.max(0.3, this.timeScale) : 1));

    const dimTarget =
      this.state === 'menu' ? (demoVisible ? 0.64 : 0.12) : frozen || this.state === 'upgrade' ? 0.35 : this.state === 'gameover' ? 0.45 : 0;
    this.dim = damp(this.dim, dimTarget, 8, rdt);

    const c = getCharacter(this.state === 'menu' ? this.save.data.selected : (this.setup?.character ?? this.save.data.selected));
    const showWorld = this.state !== 'menu' ? this.world : null;
    this.renderer.frame({
      ambient: this.state === 'menu',
      world: showWorld ?? (demoVisible ? this.demo : null),
      fx: this.fx,
      time: this.time,
      color: c.color,
      trailColor: c.trail,
      look: c.look,
      trail: getTrail(this.save.data.trail),
      dim: this.dim,
      hint: this.tutorial?.hint() ?? null,
    });
    if (this.postActive) this.renderPost(showWorld ?? (demoVisible ? this.demo : null));
    if (showWorld && this.state !== 'gameover') this.ui.hud.update(showWorld);
  };

  /** True when the device can run the light filter at all. */
  get glowSupported(): boolean {
    return !!this.post && this.post.ok;
  }

  /** The light filter runs when WebGL works, the player wants it and the device is fast enough. */
  private updatePostFx(): void {
    const on = !!this.post && this.post.ok && this.save.data.settings.glow && !this.lowQuality;
    this.postActive = on;
    this.renderer.gpuBackground = on;
    this.post?.setVisible(on);
    document.body.classList.toggle('postfx', on);
  }

  private renderPost(w: World | null): void {
    const r = this.renderer;
    const edge = BIOMES[r.biomeIndex]?.edge ?? '#7d6bff';
    const tint: [number, number, number] = [parseInt(edge.slice(1, 3), 16) / 255, parseInt(edge.slice(3, 5), 16) / 255, parseInt(edge.slice(5, 7), 16) / 255];
    const waves = w
      ? this.fx.waves.map((wv) => {
          const k = wv.age / wv.life;
          const ease = 1 - (1 - k) * (1 - k);
          return { x: r.ox + wv.x * r.scale, y: r.oy + wv.y * r.scale, radius: wv.maxR * ease * r.scale, strength: wv.strength * (1 - k) * 20 };
        })
      : [];
    // Region background with the spark's light (the menu demo shows no arena floor).
    const sh = this.fx.shakeOffset();
    const ax = r.ox + sh.x;
    const ay = r.oy + sh.y;
    const hex = getCharacter(this.state === 'menu' ? this.save.data.selected : (this.setup?.character ?? this.save.data.selected)).color;
    const rgb: [number, number, number] = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
    const scene: SceneParams = {
      region: r.biomeIndex,
      time: this.time,
      parX: w ? (w.px / w.w) * 2 - 1 : 0,
      parY: w ? (w.py / w.h) * 2 - 1 : 0,
      arena: w && this.state !== 'menu' ? { x: ax, y: ay, scale: r.scale, w: r.worldW, h: r.worldH } : null,
      light: w && w.alive ? { x: ax + w.px * r.scale, y: ay + w.py * r.scale, radius: 120 * r.scale, strength: 0.5, color: rgb } : null,
    };
    this.post!.render({ bloom: 1.25, aberration: this.fx.aberration, tint, waves, scene }, r.dpr);
  }

  /** Small embers behind the moving spark (game and menu demo). */
  private emitTrailSparks(): void {
    const w = this.state === 'menu' ? (this.demoVisible ? this.demo : null) : this.state === 'playing' ? this.world : null;
    if (!w || !w.alive) return;
    const moved = Math.hypot(w.px - this.lastPx, w.py - this.lastPy);
    this.lastPx = w.px;
    this.lastPy = w.py;
    if (moved > 1.2 && moved < 60 && Math.random() < 0.6 * this.fx.settings.density) this.fx.trailSpark(w.px, w.py, this.fx.playerColor);
  }

  /** Starts the attract-mode demo behind the menu (skipped in battery-saving mode). */
  private startDemo(): void {
    if (this.lowQuality || this.save.data.settings.reducedMotion) {
      this.demo = null;
      return;
    }
    const size = this.worldSize();
    const demo = new World({
      width: size.w,
      height: size.h,
      character: this.save.data.selected,
      seed: randomSeed(),
      modifiers: [],
      meta: {},
      daily: false,
      tutorial: false,
    });
    demo.start();
    this.demo = demo;
    this.demoAcc = 0;
    this.renderer.layout(demo.w, demo.h, this.arena);
    this.renderer.setBiome(0);
    this.fx.playerColor = getCharacter(this.save.data.selected).color;
  }

  private stepDemo(rdt: number): void {
    const d = this.demo!;
    this.demoAcc = Math.min(this.demoAcc + rdt, DT * 3);
    while (this.demoAcc >= DT) {
      this.demoAcc -= DT;
      d.invuln = 1;
      // Bot: circle the nearest shadow (or drift around the middle).
      let cx = d.w / 2;
      let cy = d.h * 0.55;
      let best = Infinity;
      for (const e of d.enemies) {
        const dd = (e.x - d.px) ** 2 + (e.y - d.py) ** 2;
        if (dd < best) {
          best = dd;
          cx = e.x;
          cy = e.y;
        }
      }
      this.demoAngle += 0.065;
      d.steer((cx + Math.cos(this.demoAngle) * 72 - d.px) * 0.3, (cy + Math.sin(this.demoAngle) * 72 - d.py) * 0.3);
      if (d.pulseReady && d.enemies.length > 5) d.triggerPulse();
      d.update(DT);
      for (const e of d.drainEvents()) this.fx.handle(e);
      // No upgrades in the backdrop: their explosions and lightning are too busy behind menus.
      if (d.awaitingUpgrade) d.nextWave();
    }
    // The menu should stay calm: no shake, flashes or hit-stop from the demo.
    this.fx.trauma = 0;
    this.fx.hitstop = 0;
    this.fx.screenFlash = 0;
    if (d.over || d.wave > 9) this.startDemo();
  }

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
    const st = this.save.data.settings;
    if (st.control === 'direct') {
      if (this.pendingPoint) {
        const p = this.fingerToWorld(this.pendingPoint.x, this.pendingPoint.y, w);
        w.setTarget(p.x, p.y);
      }
    } else if (this.pendingDx || this.pendingDy) {
      const k = st.sensitivity / this.renderer.scale;
      w.steer(this.pendingDx * k, this.pendingDy * k);
    }
    this.pendingDx = this.pendingDy = 0;
    this.pendingPoint = null;
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
    if (this.state === 'playing' && w.over && (w.timeUp || w.victory)) {
      // Blitz: time is up – straight to the results, no continue offer.
      this.input.enabled = false;
      this.endRun();
      return;
    }
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
          this.audio.spawnWarn(e.enemy === 'maw' || e.enemy === 'weaver' || e.enemy === 'twin' || e.enemy === 'hydra' || e.enemy === 'eye' || e.enemy === 'vortex');
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
          const campaignLevel = this.setup?.campaign;
          const biome = campaignLevel !== undefined ? WORLDS[getLevel(campaignLevel).world].biome : biomeForWave(e.wave);
          this.renderer.setBiome(biome);
          this.audio.setRegion(biome);
          const newRegion = campaignLevel === undefined && e.wave > 1 && (e.wave - 1) % 10 === 0;
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
            vortex: 'boss_vortex',
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

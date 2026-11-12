import { Rng } from '../core/rng';
import { SpatialGrid } from '../core/grid';
import { TAU, clamp, dist2, len, type Vec } from '../core/math';
import { inBounds, pointInPolygon, polygonArea, polygonBounds, segmentCircle, polygonCentroid } from '../core/geometry';
import { BOMB, BOSS_TYPES, ENEMIES, TUNING, WARDEN_AURA } from './config';
import { Trail } from './trail';
import { buildWave, type WavePlan } from './waves';
import { rollOffer, UPGRADE_VALUES, getUpgrade, type UpgradeLevels } from './upgrades';
import { computeStats } from './stats';
import { updateEnemy, splitterBurst, isHarmless } from './enemies';
import { updateBoss, hazardBeams } from './bosses';
import type { MetaLevels } from './meta';
import { HEADSTART_WAVE, type BoosterId } from '../economy/defs';
import type {
  Bomb,
  BossType,
  CharacterId,
  EchoLoop,
  Enemy,
  EnemyType,
  FrostField,
  GameEvent,
  KillSource,
  ModifierId,
  Pickup,
  PickupKind,
  PlayerStats,
  Projectile,
  RunStats,
  SpawnMarker,
  Thread,
  UpgradeId,
} from './types';

export interface RunOptions {
  width: number;
  height: number;
  character: CharacterId;
  seed: number;
  modifiers: ModifierId[];
  meta: MetaLevels;
  daily: boolean;
  tutorial: boolean;
  /** Boosters bought for this run. */
  boosters?: BoosterId[];
}

export type WavePhase = 'intro' | 'active' | 'cleared' | 'upgrade' | 'idle';

/**
 * The complete, headless game simulation. Knows nothing about rendering, audio or the DOM:
 * it only mutates its own state and pushes `GameEvent`s that the presentation layer consumes.
 */
export class World {
  readonly w: number;
  readonly h: number;
  readonly opts: RunOptions;
  readonly rng: Rng;
  time = 0;

  stats: PlayerStats;
  upgrades: UpgradeLevels = {};
  run: RunStats;

  // ── Player ──
  px: number;
  py: number;
  tx: number;
  ty: number;
  private kbx = 0;
  private kby = 0;
  hearts: number;
  invuln = 0;
  shieldUp = false;
  shieldTimer = 0;
  pulseCharge = 0;
  alive = true;
  secondWindUsed = false;
  over = false;
  /** Phantom spark: hits it can still ignore this wave. */
  phaseCharges = 0;

  trail: Trail;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  markers: SpawnMarker[] = [];
  threads: Thread[] = [];
  frost: FrostField[] = [];
  echoes: EchoLoop[] = [];
  bombs: Bomb[] = [];
  events: GameEvent[] = [];

  combo = 0;
  comboTimer = 0;
  rerolls: number;

  // ── Waves ──
  wave = 0;
  phase: WavePhase = 'idle';
  phaseTimer = 0;
  plan: WavePlan | null = null;
  waveTime = 0;
  private groupIdx = 0;
  private tookDamageThisWave = false;
  speedMul = 1;
  private bossCount = 0;

  private nextId = 1;
  private grid: SpatialGrid<Enemy>;
  private scratch: Enemy[] = [];
  private emberClock = 0;
  private shardFrac = 0;
  private flockSums = new Map<number, { x: number; y: number; n: number }>();
  private nextFlock = 1;
  private pendingSpawns: Enemy[] = [];
  private loopsWithKills = 0;
  private healReadyAt = 0;
  private magnetClock = 0;

  constructor(opts: RunOptions) {
    this.opts = opts;
    this.w = opts.width;
    this.h = opts.height;
    this.rng = new Rng(opts.seed);
    this.stats = computeStats(opts.character, opts.meta, this.upgrades, opts.modifiers, this.bonus());
    this.hearts = this.stats.maxHearts;
    this.px = this.tx = this.w / 2;
    this.py = this.ty = this.h * 0.62;
    this.trail = new Trail(this.stats.trailLength, this.stats.trailLife);
    this.trail.reset(this.px, this.py, 0);
    this.grid = new SpatialGrid<Enemy>(this.w, this.h, 64);
    this.rerolls = opts.meta.reroll ?? 0;
    this.pulseCharge = this.stats.noPulse ? 0 : 0.5 * (opts.meta.precharge ?? 0);
    this.run = {
      score: 0,
      shards: 0,
      kills: 0,
      loops: 0,
      bestLoop: 0,
      maxCombo: 0,
      wave: 0,
      wavesCleared: 0,
      bossesKilled: [],
      damageTaken: 0,
      bestPulse: 0,
      pulses: 0,
      revives: 0,
      time: 0,
      flawlessStreak: 0,
    };
    const b = opts.boosters ?? [];
    if (b.includes('shield')) this.shieldUp = true;
    if (b.includes('charge') && !this.stats.noPulse) this.pulseCharge = 1;
    if (b.includes('lucky')) {
      const [id] = rollOffer(this.rng, this.upgrades, 1, { exclude: this.offerExclusions(), guaranteeRare: true });
      if (id) this.applyUpgrade(id);
    }
  }

  private bonus(): { hearts: number; shardMul: number } {
    const b = this.opts.boosters ?? [];
    return { hearts: b.includes('heart') ? 1 : 0, shardMul: b.includes('magnet') ? 1.5 : 1 };
  }

  has(booster: BoosterId): boolean {
    return (this.opts.boosters ?? []).includes(booster);
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ───────────────────────── Input ─────────────────────────

  /** Relative steering (trackpad style) in world units. */
  steer(dx: number, dy: number): void {
    if (!this.alive) return;
    this.tx += dx;
    this.ty += dy;
    this.clampTarget();
  }

  setKeyboard(dx: number, dy: number): void {
    const l = len(dx, dy);
    this.kbx = l > 0 ? dx / l : 0;
    this.kby = l > 0 ? dy / l : 0;
  }

  private clampTarget(): void {
    const r = TUNING.player.radius;
    const dx = this.tx - this.px;
    const dy = this.ty - this.py;
    const d = len(dx, dy);
    const lead = TUNING.player.maxLead;
    if (d > lead) {
      this.tx = this.px + (dx / d) * lead;
      this.ty = this.py + (dy / d) * lead;
    }
    this.tx = clamp(this.tx, r, this.w - r);
    this.ty = clamp(this.ty, r, this.h - r);
  }

  // ───────────────────────── Run flow ─────────────────────────

  start(): void {
    if (this.opts.tutorial) {
      this.phase = 'idle';
      return;
    }
    if (this.has('headstart')) {
      // Skip the opening waves: three free upgrades to match the stronger enemies.
      for (let i = 0; i < 3; i++) {
        const [id] = rollOffer(this.rng, this.upgrades, 1, { exclude: this.offerExclusions() });
        if (id) this.applyUpgrade(id);
      }
      this.beginWave(HEADSTART_WAVE);
      return;
    }
    this.beginWave(1);
  }

  private beginWave(n: number): void {
    this.wave = n;
    this.run.wave = n;
    this.plan = buildWave(n, this.rng, this.opts.modifiers);
    this.speedMul = this.plan.speedMul;
    this.groupIdx = 0;
    this.waveTime = 0;
    this.tookDamageThisWave = false;
    this.phaseCharges = this.stats.phase ? 1 : 0;
    this.phase = 'intro';
    this.phaseTimer = TUNING.wave.startDelay;
    this.emit({ type: 'waveStart', wave: n, boss: this.plan.boss, newEnemy: this.plan.newEnemy });
  }

  /** Called by the app after the player picked an upgrade. */
  nextWave(): void {
    this.beginWave(this.wave + 1);
  }

  get awaitingUpgrade(): boolean {
    return this.phase === 'upgrade';
  }

  offerExclusions(): UpgradeId[] {
    const ex: UpgradeId[] = [];
    // Never offer upgrades that cannot do anything under the current modifiers.
    if (this.stats.noPulse) ex.push('pulsecharge', 'doublepulse', 'supernova', 'retaliate');
    if (this.opts.modifiers.includes('glass')) ex.push('heart', 'healloop');
    return ex;
  }

  rollOffer(): UpgradeId[] {
    return rollOffer(this.rng, this.upgrades, 3, {
      exclude: this.offerExclusions(),
      guaranteeRare: this.plan?.boss != null,
    });
  }

  reroll(): UpgradeId[] | null {
    if (this.rerolls <= 0) return null;
    this.rerolls--;
    return rollOffer(this.rng, this.upgrades, 3, { exclude: this.offerExclusions() });
  }

  applyUpgrade(id: UpgradeId): void {
    const def = getUpgrade(id);
    const lvl = Math.min(def.max, (this.upgrades[id] ?? 0) + 1);
    this.upgrades[id] = lvl;
    this.stats = computeStats(this.opts.character, this.opts.meta, this.upgrades, this.opts.modifiers, this.bonus());
    this.trail.maxLength = this.stats.trailLength;
    this.trail.life = this.stats.trailLife;
    if (id === 'heart') this.hearts = Math.min(this.stats.maxHearts, this.hearts + 1);
    if (id === 'shield' && !this.shieldUp) {
      this.shieldUp = true;
      this.emit({ type: 'shieldUp' });
    }
  }

  // ───────────────────────── Simulation ─────────────────────────

  update(dt: number): void {
    if (this.over) return;
    this.time += dt;
    this.run.time += dt;

    this.updatePlayer(dt);
    const loop = this.trail.update(this.px, this.py, this.time);
    if (loop) this.resolveLoop(loop.poly, false);
    this.updateEchoes();
    this.updateWave(dt);
    this.updateMarkers(dt);
    this.updateEnemies(dt);
    this.updateShields();
    this.updateProjectiles(dt);
    this.updateThreads(dt);
    this.updateHazardContacts();
    this.updateFrost(dt);
    this.updateBombs(dt);
    this.updateEmber(dt);
    this.updatePickups(dt);
    this.flushSpawns();
    this.cleanup();

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        if (this.combo >= 2) this.emit({ type: 'comboLost', combo: this.combo });
        this.combo = 0;
      }
    }
  }

  private updatePlayer(dt: number): void {
    if (!this.alive) return;
    const s = this.stats.speed;
    if (this.kbx || this.kby) {
      // Keyboard (desktop): constant-speed movement instead of 1:1 drag.
      this.tx = this.px + this.kbx * TUNING.player.keyboardSpeed * dt;
      this.ty = this.py + this.kby * TUNING.player.keyboardSpeed * dt;
      this.clampTarget();
    }
    const dx = this.tx - this.px;
    const dy = this.ty - this.py;
    const d = len(dx, dy);
    if (d > 0.0001) {
      const step = Math.min(d, s * dt);
      this.px += (dx / d) * step;
      this.py += (dy / d) * step;
      if (this.stats.cometCharge && !this.stats.noPulse) this.addPulse(step * TUNING.pulse.cometPerUnit);
    }
    if (this.phase === 'active' || this.opts.tutorial) this.addPulse(TUNING.pulse.passive * this.stats.pulseGain * dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.stats.shield > 0 && !this.shieldUp) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shieldUp = true;
        this.emit({ type: 'shieldUp' });
      }
    }
  }

  private addPulse(amount: number): void {
    if (this.stats.noPulse) return;
    const before = this.pulseCharge;
    this.pulseCharge = Math.min(this.stats.maxPulse, this.pulseCharge + amount);
    if (Math.floor(this.pulseCharge) > Math.floor(before)) this.emit({ type: 'pulseReady' });
  }

  comboMult(): number {
    if (this.combo <= 1) return 1;
    return Math.min(TUNING.combo.max, 1 + TUNING.combo.perStep * (this.combo - 1));
  }

  // ───────────────────────── Loops ─────────────────────────

  private resolveLoop(poly: Vec[], echo: boolean): void {
    const b = polygonBounds(poly);
    const inside: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.dead || e.t < 0.05) continue;
      if (inBounds(b, e.x, e.y) && pointInPolygon(e.x, e.y, poly)) inside.push(e);
    }

    // Twins caught together take double damage and get stunned.
    const twinsInside = inside.filter((e) => e.type === 'twin');
    const bothTwins = twinsInside.length === 2 && twinsInside[0].partner === twinsInside[1].id;

    const killed: Enemy[] = [];
    for (const e of inside) {
      if (e.shielded && !this.stats.pierce) {
        // Protected by a warden – the loop bounces off.
        this.emit({ type: 'blocked', x: e.x, y: e.y });
        continue;
      }
      let dmg = this.stats.loopDamage + (e.boss && this.stats.pierce ? 1 : 0);
      if (bothTwins && e.type === 'twin') {
        dmg *= 2;
        e.stun = 1.6;
      }
      if (this.hurt(e, dmg)) killed.push(e);
    }

    const k = killed.length;
    if (k > 0 && !echo) {
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
      this.comboTimer = this.stats.comboWindow;
      this.run.maxCombo = Math.max(this.run.maxCombo, this.combo);
      if (this.combo >= 2) this.emit({ type: 'combo', combo: this.combo });
    } else if (k > 0) {
      this.comboTimer = Math.max(this.comboTimer, this.stats.comboWindow * 0.5);
    }
    const mult = (1 + TUNING.multiKillBonus * Math.max(0, k - 1)) * this.comboMult();
    for (const e of killed) this.kill(e, echo ? 'echo' : 'loop', mult);

    // Upgrade synergies triggered by loop kills.
    if (this.stats.shockwave > 0) {
      const r = UPGRADE_VALUES.shockRadius(this.stats.shockwave);
      for (const e of killed) this.explode(e.x, e.y, r);
    }
    if (this.stats.chain > 0) {
      const hit = new Set<Enemy>(killed);
      for (const e of killed) this.chainFrom(e, this.stats.chain, hit);
    }
    if (this.stats.treasure > 0) for (const e of killed) this.dropShards(e.x, e.y, this.stats.treasure);

    // Projectiles and pickups inside are captured too.
    for (const p of this.projectiles) {
      if (!p.dead && inBounds(b, p.x, p.y) && pointInPolygon(p.x, p.y, poly)) {
        p.dead = true;
        this.emit({ type: 'explosion', x: p.x, y: p.y, r: 8 });
      }
    }
    for (const p of this.pickups) {
      if (!p.dead && inBounds(b, p.x, p.y) && pointInPolygon(p.x, p.y, poly)) p.magnet = true;
    }

    if (!echo) {
      this.run.loops++;
      if (this.stats.frost > 0) {
        const life = UPGRADE_VALUES.frostTime(this.stats.frost);
        this.frost.push({ poly, bounds: b, life, maxLife: life });
      }
      for (let i = 0; i < this.stats.echo; i++) this.echoes.push({ poly, bounds: b, at: this.time + 0.6 * (i + 1) });
      if (k >= 3 && this.stats.slowmo > 0) this.emit({ type: 'slowmo', duration: UPGRADE_VALUES.slowmoTime(this.stats.slowmo) });
      if (k > 0) this.addPulse(TUNING.pulse.gainPerLoop * this.stats.pulseGain);
      if (k > 0 && this.stats.supernovaEvery > 0 && ++this.loopsWithKills % this.stats.supernovaEvery === 0) this.triggerPulse(true);
      if (k >= 6 && this.stats.healLoop && this.time >= this.healReadyAt && this.hearts < this.stats.maxHearts) {
        this.hearts++;
        this.healReadyAt = this.time + 15;
        this.emit({ type: 'heal', x: this.px, y: this.py });
      }
    }
    this.run.bestLoop = Math.max(this.run.bestLoop, k);
    const c = polygonCentroid(poly);
    this.emit({ type: 'loop', poly, cx: c.x, cy: c.y, area: polygonArea(poly), kills: k, combo: this.combo, echo });
  }

  private updateEchoes(): void {
    if (this.echoes.length === 0) return;
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      if (this.time >= e.at) {
        this.echoes.splice(i, 1);
        this.resolveLoop(e.poly, true);
      }
    }
  }

  private explode(x: number, y: number, r: number): void {
    this.emit({ type: 'explosion', x, y, r });
    for (const o of this.enemies) {
      if (o.dead || (o.shielded && !this.stats.pierce)) continue;
      if (dist2(x, y, o.x, o.y) <= (r + o.r) * (r + o.r)) this.damage(o, 1, 'shockwave');
    }
  }

  private chainFrom(src: Enemy, count: number, hit: Set<Enemy>): void {
    const candidates = this.enemies
      .filter((o) => !o.dead && !hit.has(o) && !(o.shielded && !this.stats.pierce) && dist2(src.x, src.y, o.x, o.y) < 135 * 135)
      .sort((a, b) => dist2(src.x, src.y, a.x, a.y) - dist2(src.x, src.y, b.x, b.y))
      .slice(0, count);
    for (const o of candidates) {
      hit.add(o);
      this.emit({ type: 'chain', ax: src.x, ay: src.y, bx: o.x, by: o.y });
      this.damage(o, 1, 'chain');
      // Gewitterschleife: every lightning strike also bursts.
      if (this.stats.storm) this.explode(o.x, o.y, 34);
    }
  }

  // ───────────────────────── Damage ─────────────────────────

  /** Applies damage without resolving death. Returns true if this hit was lethal. */
  private hurt(e: Enemy, amount: number): boolean {
    if (e.dead || e.hp <= 0) return false;
    e.hp -= amount;
    e.hitFlash = 1;
    if (e.hp <= 0) return true;
    this.emit({ type: 'enemyHit', x: e.x, y: e.y, enemy: e.type });
    if (e.boss && e.phase === 0 && e.hp <= e.maxHp / 2) {
      e.phase = 1;
      this.emit({ type: 'bossPhase', x: e.x, y: e.y });
    }
    return false;
  }

  /** Damage from secondary sources (combo multiplier only). */
  damage(e: Enemy, amount: number, source: KillSource): boolean {
    if (this.hurt(e, amount)) {
      this.kill(e, source, this.comboMult());
      return true;
    }
    return false;
  }

  private kill(e: Enemy, source: KillSource, mult: number): void {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    const score = Math.round(e.score * mult * this.stats.scoreMul * (e.elite ? 2 : 1));
    this.run.score += score;
    this.run.kills++;
    this.emit({ type: 'kill', x: e.x, y: e.y, enemy: e.type, elite: e.elite, r: e.r, score, source });

    this.dropShards(e.x, e.y, e.shards * (e.elite ? 3 : 1));
    const heartChance = e.elite ? TUNING.eliteHeartDropChance : TUNING.heartDropChance;
    if (!e.boss && this.hearts < this.stats.maxHearts && this.rng.chance(heartChance)) this.dropPickup('heart', e.x, e.y, 1);
    this.addPulse(TUNING.pulse.gainPerKill * this.stats.pulseGain);

    if (e.type === 'splitter' && source !== 'boss') splitterBurst(this, e);
    if (e.type === 'bomber' && source !== 'boss') {
      this.bombs.push({ x: e.x, y: e.y, t: BOMB.fuse, total: BOMB.fuse, r: BOMB.radius });
      this.emit({ type: 'bombArmed', x: e.x, y: e.y });
    }
    if (e.type === 'head' && this.enemies.some((o) => o !== e && o.type === 'head' && !o.dead)) return;
    if (e.type === 'twin') {
      const p = this.enemyById(e.partner);
      if (p && !p.dead) {
        p.phase = 1;
        p.timer = 1.2;
        this.emit({ type: 'bossPhase', x: p.x, y: p.y });
        return;
      }
    }
    if (e.boss) this.bossDefeated(e);
  }

  private bossDefeated(e: Enemy): void {
    const boss: BossType = e.type === 'twin' ? 'twins' : e.type === 'head' ? 'hydra' : (e.type as BossType);
    this.run.bossesKilled.push(boss);
    this.emit({ type: 'bossDeath', boss, x: e.x, y: e.y });
    // The boss takes its minions with it.
    for (const o of this.enemies) if (!o.dead && !o.boss) this.kill(o, 'boss', 1);
    this.markers.length = 0;
    this.pendingSpawns.length = 0;
    if (this.plan) this.groupIdx = this.plan.groups.length;
    for (const p of this.projectiles) p.dead = true;
    this.threads.length = 0;
    this.bombs.length = 0;
    this.dropPickup('heart', e.x, e.y, 1);
    if (this.hearts < this.stats.maxHearts) {
      this.hearts++;
      this.emit({ type: 'heal', x: this.px, y: this.py });
    }
  }

  private dropShards(x: number, y: number, value: number): void {
    let v = Math.floor(value);
    if (this.rng.chance(value - v)) v++;
    while (v >= 5) {
      this.dropPickup('bigshard', x, y, 5);
      v -= 5;
    }
    for (let i = 0; i < v; i++) this.dropPickup('shard', x, y, 1);
  }

  private dropPickup(kind: PickupKind, x: number, y: number, value: number): void {
    const a = this.rng.range(0, TAU);
    const sp = this.rng.range(40, 120);
    this.pickups.push({
      kind,
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      value,
      life: TUNING.pickup.life,
      magnet: false,
      dead: false,
    });
  }

  // ───────────────────────── Player damage & pulse ─────────────────────────

  hitPlayer(): void {
    if (!this.alive || this.invuln > 0) return;
    this.knockAround(TUNING.player.hitKnockRadius, TUNING.player.hitKnock);
    if (this.opts.tutorial) {
      this.invuln = 1;
      this.emit({ type: 'shieldBreak', x: this.px, y: this.py });
      return;
    }
    if (this.phaseCharges > 0) {
      // Phantom slips through the first hit of each wave.
      this.phaseCharges--;
      this.invuln = 1.2;
      this.emit({ type: 'shieldBreak', x: this.px, y: this.py });
      return;
    }
    if (this.shieldUp) {
      this.shieldUp = false;
      this.shieldTimer = TUNING.shield.regen[Math.min(3, this.stats.shield)];
      this.invuln = 1;
      this.emit({ type: 'shieldBreak', x: this.px, y: this.py });
      return;
    }
    this.hearts--;
    this.run.damageTaken++;
    this.tookDamageThisWave = true;
    this.invuln = TUNING.player.invuln;
    if (this.combo >= 2) this.emit({ type: 'comboLost', combo: this.combo });
    this.combo = 0;
    this.comboTimer = 0;
    this.emit({ type: 'playerHit', x: this.px, y: this.py, hearts: this.hearts });
    if (this.hearts > 0 && this.stats.retaliate) this.triggerPulse(true);
    if (this.hearts > 0 && this.stats.phoenix) this.igniteTrail();
    if (this.hearts <= 0) {
      if (this.stats.secondWind && !this.secondWindUsed) {
        this.secondWindUsed = true;
        this.hearts = 1;
        this.invuln = 2.5;
        this.emit({ type: 'revive', x: this.px, y: this.py });
        this.triggerPulse(true);
      } else {
        this.alive = false;
        this.over = true;
        this.run.shards = Math.floor(this.run.shards);
        this.emit({ type: 'playerDeath', x: this.px, y: this.py });
      }
    }
  }

  private knockAround(radius: number, force: number): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const d = len(dx, dy) || 1;
      if (d < radius + e.r) {
        const f = force * (1 - e.mass);
        e.kx += (dx / d) * f;
        e.ky += (dy / d) * f;
      }
    }
    for (const p of this.projectiles) if (dist2(p.x, p.y, this.px, this.py) < radius * radius) p.dead = true;
  }

  get pulseReady(): boolean {
    return !this.stats.noPulse && this.pulseCharge >= 1 && this.alive;
  }

  triggerPulse(free = false): boolean {
    if (!this.alive || this.stats.noPulse) return false;
    if (!free && this.pulseCharge < 1) return false;
    if (!free) {
      this.pulseCharge = Math.max(0, this.pulseCharge - 1);
      this.run.pulses++;
    }
    const r = this.stats.pulseRadius;
    let kills = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const d = len(dx, dy) || 1;
      if (d < r + e.r) {
        if (this.damage(e, this.stats.starfrost ? 2 : 1, 'pulse')) kills++;
        const f = TUNING.pulse.knock * (1 - e.mass) * (1 - (d / r) * 0.5);
        e.kx += (dx / d) * f;
        e.ky += (dy / d) * f;
      }
    }
    for (const p of this.projectiles) if (dist2(p.x, p.y, this.px, this.py) < r * r) p.dead = true;
    this.invuln = Math.max(this.invuln, TUNING.pulse.invuln);
    this.run.bestPulse = Math.max(this.run.bestPulse, kills);
    this.emit({ type: 'pulse', x: this.px, y: this.py, radius: r, kills });
    if (this.stats.starfrost) {
      // Sternenfrost: the pulse leaves a ring of frost behind.
      const poly: Vec[] = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        poly.push({ x: this.px + Math.cos(a) * r, y: this.py + Math.sin(a) * r });
      }
      const life = 3;
      this.frost.push({ poly, bounds: polygonBounds(poly), life, maxLife: life });
    }
    return true;
  }

  /**
   * Continues a finished run (paid or ad-based revive): full hearts, a free pulse that clears
   * the surroundings, and a few seconds of invulnerability.
   */
  revive(): void {
    if (!this.over) return;
    this.over = false;
    this.alive = true;
    this.hearts = this.stats.maxHearts;
    this.invuln = 3;
    this.run.revives++;
    this.tx = this.px;
    this.ty = this.py;
    this.trail.reset(this.px, this.py, this.time);
    for (const p of this.projectiles) p.dead = true;
    this.emit({ type: 'revive', x: this.px, y: this.py });
    this.triggerPulse(true);
  }

  // ───────────────────────── Waves & spawning ─────────────────────────

  private updateWave(dt: number): void {
    if (this.opts.tutorial || !this.plan) return;
    if (this.phase === 'intro') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'active';
        this.waveTime = 0;
        if (this.plan.boss) this.spawnBossMarker(this.plan.boss);
      }
      return;
    }
    if (this.phase === 'active') {
      this.waveTime += dt;
      const alive = this.aliveCount() + this.markers.length;
      while (this.groupIdx < this.plan.groups.length) {
        const g = this.plan.groups[this.groupIdx];
        if (g.at > this.waveTime || alive >= this.plan.cap) break;
        this.spawnGroup(g.type, g.count, g.elite);
        this.groupIdx++;
      }
      if (this.groupIdx >= this.plan.groups.length && this.markers.length === 0 && this.aliveCount() === 0) {
        this.waveCleared();
      }
      return;
    }
    if (this.phase === 'cleared') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.phase = 'upgrade';
    }
  }

  private waveCleared(): void {
    const flawless = !this.tookDamageThisWave;
    const bonus = Math.round(100 * this.wave * (flawless ? 1.5 : 1) * this.stats.scoreMul);
    this.run.score += bonus;
    this.run.wavesCleared = this.wave;
    this.run.flawlessStreak = flawless ? this.run.flawlessStreak + 1 : 0;
    this.addShards(this.wave);
    for (const p of this.pickups) p.magnet = true;
    for (const p of this.projectiles) p.dead = true;
    this.threads.length = 0;
    this.bombs.length = 0;
    this.phase = 'cleared';
    this.phaseTimer = TUNING.wave.breakDelay;
    this.emit({ type: 'waveClear', wave: this.wave, flawless, bonus, boss: this.plan?.boss != null });
  }

  private addShards(raw: number): void {
    this.shardFrac += raw * this.stats.shardMul;
    const whole = Math.floor(this.shardFrac);
    this.shardFrac -= whole;
    this.run.shards += whole;
  }

  aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n + this.pendingSpawns.length;
  }

  countType(t: EnemyType): number {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && e.type === t) n++;
    for (const m of this.markers) if (m.type === t) n++;
    return n;
  }

  private edgePoint(): Vec {
    const inset = TUNING.spawn.edgeInset;
    let best: Vec = { x: inset, y: inset };
    let bestD = -1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const perim = 2 * (this.w + this.h);
      let p = this.rng.range(0, perim);
      let x: number;
      let y: number;
      if (p < this.w) {
        x = p;
        y = inset;
      } else if ((p -= this.w) < this.h) {
        x = this.w - inset;
        y = p;
      } else if ((p -= this.h) < this.w) {
        x = this.w - p;
        y = this.h - inset;
      } else {
        x = inset;
        y = this.h - (p - this.w);
      }
      x = clamp(x, inset, this.w - inset);
      y = clamp(y, inset, this.h - inset);
      const d = dist2(x, y, this.px, this.py);
      if (d > TUNING.spawn.minPlayerDist ** 2) return { x, y };
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best;
  }

  private spawnGroup(type: EnemyType, count: number, elite: boolean[]): void {
    const base = this.edgePoint();
    const flock = type === 'gnat' ? this.nextFlock++ : 0;
    const spread = type === 'gnat' ? 26 : 34;
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, TAU);
      const r = i === 0 ? 0 : this.rng.range(spread * 0.4, spread);
      const x = clamp(base.x + Math.cos(a) * r, 16, this.w - 16);
      const y = clamp(base.y + Math.sin(a) * r, 16, this.h - 16);
      this.queueMarker(type, x, y, elite[i] ?? false, flock, i === 0);
    }
  }

  queueMarker(type: EnemyType, x: number, y: number, elite: boolean, flock: number, announce = true): void {
    const warn = TUNING.spawn.warn;
    this.markers.push({ x, y, t: warn, total: warn, type, elite, flock });
    if (announce) this.emit({ type: 'spawnWarn', x, y, enemy: type });
  }

  private spawnBossMarker(boss: BossType): void {
    const warn = TUNING.spawn.bossWarn;
    const x = this.w / 2;
    const y = this.py > this.h / 2 ? this.h * 0.27 : this.h * 0.73;
    const type: EnemyType = boss === 'twins' ? 'twin' : boss;
    const bx = boss === 'eye' ? this.w / 2 : x;
    const by = boss === 'eye' ? this.h / 2 : y;
    this.markers.push({ x: bx, y: by, t: warn, total: warn, type, elite: false, flock: -1 });
    this.emit({ type: 'spawnWarn', x: bx, y: by, enemy: type });
  }

  private updateMarkers(dt: number): void {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t -= dt;
      if (m.t > 0) continue;
      this.markers.splice(i, 1);
      if (m.flock === -1) this.spawnBoss(m.x, m.y);
      else {
        const e = this.createEnemy(m.type, m.x, m.y, m.elite, m.flock);
        this.enemies.push(e);
        this.emit({ type: 'spawn', x: m.x, y: m.y, enemy: m.type, elite: m.elite });
      }
    }
  }

  private spawnBoss(x: number, y: number): void {
    const boss = this.plan?.boss ?? 'maw';
    const tier = this.plan?.bossTier ?? 0;
    this.bossCount++;
    if (boss === 'twins') {
      const a = this.createEnemy('twin', x - 80, y, false, 0, tier);
      const b = this.createEnemy('twin', x + 80, y, false, 0, tier);
      a.partner = b.id;
      b.partner = a.id;
      a.bx = b.bx = x;
      a.by = b.by = y;
      a.angle = Math.PI;
      b.seed = 1; // colour index
      this.enemies.push(a, b);
    } else if (boss === 'eye') {
      this.enemies.push(this.createEnemy('eye', this.w / 2, this.h / 2, false, 0, tier));
    } else {
      this.enemies.push(this.createEnemy(boss, x, y, false, 0, tier));
    }
    this.emit({ type: 'bossSpawn', boss, x, y });
  }

  createEnemy(type: EnemyType, x: number, y: number, elite: boolean, flock = 0, tier = 0): Enemy {
    const def = ENEMIES[type];
    const boss = BOSS_TYPES.includes(type);
    const hp = boss ? Math.round(def.hp * (1 + 0.6 * tier)) : def.hp + (elite ? 1 : 0);
    return {
      id: this.nextId++,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      r: def.r * (elite ? 1.18 : 1),
      hp,
      maxHp: hp,
      speed: def.speed * (boss ? 1 : this.speedMul * this.rng.range(0.9, 1.1)),
      t: 0,
      state: 0,
      timer: boss ? 2.2 : this.rng.range(0.8, 1.8),
      ax: boss ? 6 : 0,
      ay: 0,
      angle: this.rng.range(0, TAU),
      orbit: boss ? tier : this.rng.sign(),
      bx: x,
      by: y,
      elite,
      boss,
      dead: false,
      hitFlash: 0,
      slow: 1,
      stun: 0,
      emberAcc: 0,
      score: def.score * (boss ? 1 + 0.5 * tier : 1),
      shards: def.shards * (boss ? 1 + 0.5 * tier : 1),
      seed: boss ? 0 : this.rng.range(0, 1000),
      flock,
      partner: -1,
      phase: 0,
      mass: def.mass,
      shielded: false,
    };
  }

  /** Phönixspur: the whole light trail flares up and burns everything touching it. */
  private igniteTrail(): void {
    const pts = this.trail.points;
    if (pts.length < 2) return;
    for (let i = 0; i < pts.length; i += 6) this.emit({ type: 'explosion', x: pts[i].x, y: pts[i].y, r: 26 });
    for (const e of this.enemies) {
      if (!e.dead && this.trail.touchesCircle(e.x, e.y, e.r + 22)) this.damage(e, 2, 'ember');
    }
  }

  /** Hydra at half health: the body bursts into three heads (the fight continues). */
  splitHydra(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    const tier = e.orbit;
    this.run.score += Math.round(e.score * this.stats.scoreMul);
    this.emit({ type: 'bossPhase', x: e.x, y: e.y });
    this.emit({ type: 'explosion', x: e.x, y: e.y, r: 60 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + this.rng.range(-0.3, 0.3);
      const h = this.createEnemy('head', e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, false, 0, tier);
      h.kx = Math.cos(a) * 260;
      h.ky = Math.sin(a) * 260;
      h.t = 0.6;
      h.seed = i * 2.1;
      h.timer = 1.5 + i * 0.6;
      this.queueSpawn(h);
    }
  }

  /** Tutorial helper: spawns an enemy directly (optionally frozen in place). */
  spawnDirect(type: EnemyType, x: number, y: number, frozen = false): Enemy {
    const e = this.createEnemy(type, x, y, false);
    e.speed = frozen ? 0 : e.speed * 0.6;
    this.enemies.push(e);
    this.emit({ type: 'spawn', x, y, enemy: type, elite: false });
    return e;
  }

  enemyById(id: number): Enemy | undefined {
    if (id < 0) return undefined;
    for (const e of this.enemies) if (e.id === id) return e;
    return undefined;
  }

  flockCenter(flock: number): Vec | null {
    const s = this.flockSums.get(flock);
    return s && s.n > 1 ? { x: s.x / s.n, y: s.y / s.n } : null;
  }

  shoot(x: number, y: number, angle: number, speed: number, r: number): void {
    this.projectiles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, life: 9, dead: false });
  }

  addThread(ax: number, ay: number, bx: number, by: number): void {
    this.threads.push({ ax, ay, bx, by, warn: 0.45, life: 3, maxLife: 3 });
    this.emit({ type: 'thread', ax, ay, bx, by });
  }

  // ───────────────────────── Per-tick systems ─────────────────────────

  private updateEnemies(dt: number): void {
    // Flock centres for swarm cohesion.
    this.flockSums.clear();
    for (const e of this.enemies) {
      if (e.dead || e.flock <= 0) continue;
      const s = this.flockSums.get(e.flock) ?? { x: 0, y: 0, n: 0 };
      s.x += e.x;
      s.y += e.y;
      s.n++;
      this.flockSums.set(e.flock, s);
    }

    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);

    const hitR = this.stats.hitRadius;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
      if (e.stun > 0) e.stun -= dt;
      if (e.boss) updateBoss(this, e, dt);
      else updateEnemy(this, e, dt);

      const stunMul = e.stun > 0 && !e.boss ? 0.25 : 1;
      const mul = e.slow * stunMul;
      e.x += (e.vx * mul + e.kx) * dt;
      e.y += (e.vy * mul + e.ky) * dt;
      const decay = Math.exp(-6 * dt);
      e.kx *= decay;
      e.ky *= decay;

      // Soft separation so groups don't collapse into one blob.
      if (!e.boss) {
        for (const o of this.grid.query(e.x, e.y, e.r * 2, this.scratch)) {
          if (o === e || o.dead) continue;
          const dx = e.x - o.x;
          const dy = e.y - o.y;
          const min = (e.r + o.r) * 0.85;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = ((min - d) / d) * (o.boss ? 1 : 0.5);
            e.x += dx * push;
            e.y += dy * push;
          }
        }
      }
      e.x = clamp(e.x, e.r, this.w - e.r);
      e.y = clamp(e.y, e.r, this.h - e.r);

      // Contact with the player (after a short spawn grace period).
      if (this.alive && e.t > 0.35 && !isHarmless(e)) {
        const rr = e.r * 0.9 + hitR;
        if (dist2(e.x, e.y, this.px, this.py) < rr * rr) this.hitPlayer();
      }

      // Cutters slice the trail, then are dazed – a window to punish them.
      if (e.type === 'cutter' && e.stun <= 0 && e.t > 0.35) {
        const cut = this.trail.cutByCircle(e.x, e.y, e.r);
        if (cut) {
          e.stun = 1.2;
          this.emit({ type: 'trailCut', x: cut.x, y: cut.y });
        }
      }
    }
  }

  /** Wardens protect every other non-boss shadow inside their aura. */
  private updateShields(): void {
    const wardens = this.enemies.filter((e) => e.type === 'warden' && !e.dead && e.t > 0.3);
    for (const e of this.enemies) {
      e.shielded = false;
      if (e.dead || e.boss || e.type === 'warden' || wardens.length === 0) continue;
      for (const w of wardens) {
        if (dist2(e.x, e.y, w.x, w.y) < WARDEN_AURA * WARDEN_AURA) {
          e.shielded = true;
          break;
        }
      }
    }
  }

  private updateBombs(dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t -= dt;
      if (b.t > 0) continue;
      this.bombs.splice(i, 1);
      this.emit({ type: 'explosion', x: b.x, y: b.y, r: b.r });
      const rr = b.r + this.stats.hitRadius;
      if (this.alive && dist2(b.x, b.y, this.px, this.py) < rr * rr) this.hitPlayer();
      // Bombs also blow up nearby shadows – chain reactions are part of the fun.
      for (const o of this.enemies) if (!o.dead && dist2(b.x, b.y, o.x, o.y) < (b.r + o.r) ** 2) this.damage(o, 1, 'shockwave');
    }
  }

  private updateProjectiles(dt: number): void {
    const hitR = this.stats.hitRadius;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      let slow = 1;
      for (const f of this.frost) {
        if (inBounds(f.bounds, p.x, p.y) && pointInPolygon(p.x, p.y, f.poly)) slow = 0.5;
      }
      p.x += p.vx * dt * slow;
      p.y += p.vy * dt * slow;
      p.life -= dt;
      if (p.life <= 0 || p.x < -20 || p.y < -20 || p.x > this.w + 20 || p.y > this.h + 20) p.dead = true;
      else if (this.alive) {
        const rr = p.r + hitR;
        if (dist2(p.x, p.y, this.px, this.py) < rr * rr) {
          p.dead = true;
          this.hitPlayer();
        }
      }
    }
  }

  private updateThreads(dt: number): void {
    for (let i = this.threads.length - 1; i >= 0; i--) {
      const t = this.threads[i];
      if (t.warn > 0) t.warn -= dt;
      else t.life -= dt;
      if (t.life <= 0) this.threads.splice(i, 1);
    }
  }

  /** Threads and the twin beam both hurt the player and cut the trail. */
  private updateHazardContacts(): void {
    const segs: { ax: number; ay: number; bx: number; by: number }[] = [];
    for (const t of this.threads) if (t.warn <= 0) segs.push(t);
    segs.push(...hazardBeams(this));
    for (const s of segs) {
      if (this.alive && segmentCircle(s.ax, s.ay, s.bx, s.by, this.px, this.py, this.stats.hitRadius + 2)) this.hitPlayer();
      const cut = this.trail.cutBySegment(s.ax, s.ay, s.bx, s.by);
      if (cut) this.emit({ type: 'trailCut', x: cut.x, y: cut.y });
    }
  }

  private updateFrost(dt: number): void {
    for (let i = this.frost.length - 1; i >= 0; i--) {
      this.frost[i].life -= dt;
      if (this.frost[i].life <= 0) this.frost.splice(i, 1);
    }
    const slow = UPGRADE_VALUES.frostSlow(this.stats.frost);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.slow = 1;
      for (const f of this.frost) {
        if (inBounds(f.bounds, e.x, e.y) && pointInPolygon(e.x, e.y, f.poly)) {
          e.slow = e.boss ? Math.max(slow, 0.7) : slow;
          break;
        }
      }
    }
  }

  private updateEmber(dt: number): void {
    if (this.stats.ember <= 0 || this.trail.points.length < 2) return;
    this.emberClock += dt;
    if (this.emberClock < 0.1) return;
    const step = this.emberClock;
    this.emberClock = 0;
    const b = polygonBounds(this.trail.points);
    const tick = UPGRADE_VALUES.emberTick(this.stats.ember) * (this.stats.phoenix ? 0.5 : 1);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (inBounds(b, e.x, e.y, e.r + 4) && this.trail.touchesCircle(e.x, e.y, e.r + 3)) {
        e.emberAcc += step;
        if (e.emberAcc >= tick) {
          e.emberAcc = 0;
          this.damage(e, 1, 'ember');
        }
      } else {
        e.emberAcc = Math.max(0, e.emberAcc - step * 0.5);
      }
    }
  }

  private updatePickups(dt: number): void {
    const magnet = this.stats.magnet;
    if (this.stats.magnetTrail && this.trail.points.length > 1 && (this.magnetClock += dt) >= 0.1) {
      this.magnetClock = 0;
      for (const p of this.pickups) if (!p.dead && !p.magnet && this.trail.touchesCircle(p.x, p.y, 18)) p.magnet = true;
    }
    const fr = Math.exp(-TUNING.pickup.friction * dt);
    for (const p of this.pickups) {
      if (p.dead) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.dead = true;
        continue;
      }
      const dx = this.px - p.x;
      const dy = this.py - p.y;
      const d = len(dx, dy) || 1;
      if (this.alive && (p.magnet || d < magnet)) {
        p.magnet = true;
        p.vx += (dx / d) * TUNING.pickup.attract * dt;
        p.vy += (dy / d) * TUNING.pickup.attract * dt;
        const sp = len(p.vx, p.vy);
        const max = 520;
        if (sp > max) {
          p.vx = (p.vx / sp) * max;
          p.vy = (p.vy / sp) * max;
        }
        // Steer straight in when close so pickups never orbit.
        if (d < 40) {
          p.vx = (dx / d) * Math.max(sp, 240);
          p.vy = (dy / d) * Math.max(sp, 240);
        }
      } else {
        p.vx *= fr;
        p.vy *= fr;
      }
      p.x = clamp(p.x + p.vx * dt, 6, this.w - 6);
      p.y = clamp(p.y + p.vy * dt, 6, this.h - 6);
      if (this.alive && d < TUNING.player.radius + 10) {
        p.dead = true;
        if (p.kind === 'heart') {
          if (this.hearts < this.stats.maxHearts) this.hearts++;
          this.emit({ type: 'heal', x: p.x, y: p.y });
        } else {
          this.addShards(p.value);
        }
        this.emit({ type: 'pickup', kind: p.kind, x: p.x, y: p.y, value: p.value });
      }
    }
  }

  /** Spawns created mid-tick (e.g. splitter minis) join the world at the end of the tick. */
  queueSpawn(e: Enemy): void {
    this.pendingSpawns.push(e);
  }

  private flushSpawns(): void {
    if (this.pendingSpawns.length) {
      this.enemies.push(...this.pendingSpawns);
      this.pendingSpawns.length = 0;
    }
  }

  private cleanup(): void {
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
    if (this.pickups.some((p) => p.dead)) this.pickups = this.pickups.filter((p) => !p.dead);
  }

  /** Living bosses (for the HUD health bar). */
  bosses(): Enemy[] {
    return this.enemies.filter((e) => e.boss && !e.dead);
  }
}

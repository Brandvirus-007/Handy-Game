import { t, fmt, fmtShort, getLang, type I18nKey } from '../core/i18n';
import { CHARACTERS, getCharacter } from '../game/characters';
import { TRAILS, type TrailId } from '../game/trails';
import { MODES, getMode, type GameMode } from '../game/modes';
import { META, META_VALUES, metaCost, metaLevelReq } from '../game/meta';
import { ACHIEVEMENTS } from '../game/achievements';
import { getUpgrade, UPGRADE_VALUES } from '../game/upgrades';
import { TUNING } from '../game/config';
import type { CharacterId, EnemyType, MetaId, UpgradeId } from '../game/types';
import type { App, ContinueOffer, RunResult } from '../app';
import {
  BOOSTERS,
  EXCHANGE,
  FREE_DIAMOND_AD_REWARD,
  LOGIN_REWARDS,
  MILESTONES,
  MISSION_BONUS,
  PRODUCTS,
  SHOW_MONEY_VALUES,
  getProduct,
  REVIVE_COUNTDOWN,
  diamondsForCoins,
  xpForLevel,
  type BoosterId,
  type Currency,
  type ProductId,
  type Reward,
} from '../economy/defs';
import { anyMetaBuyable, levelPath, nextUnlockLevel, type Unlock } from '../economy/unlocks';
import { PASS_FREE, PASS_PREMIUM, PASS_TIERS, PASS_XP_PER_TIER, canClaim, hasPremium, passClaimable, passTier, premiumTotals, seasonDaysLeft, type PassReward, type PassTrack } from '../economy/pass';
import { localDateKey } from '../core/rng';
import { WEEKLY_REWARDS, weekOf, weeklyDaysLeft, weeklyTheme } from '../economy/weekly';
import { MASTERY_MAX, masteryBonus, masteryLevel, masteryReward, masteryXpFor } from '../economy/mastery';
import { LEVELS_PER_WORLD, LEVEL_COUNT, WORLDS, getLevel } from '../game/campaign';
import { levelStars, levelUnlocked, nextLevel, totalStars, worldStars } from '../economy/campaign';
import { achievementDiamonds, availableBoosters, boosterCost, canClaimMissionBonus, missionsClaimable } from '../economy/profile';
import { privacyHtml } from './privacy';
import { icon } from './icons';
import type { CloudSave } from '../economy/cloud';
import type { SaveData } from '../core/storage';
import type { LeaderboardKey } from '../platform/games-ids';
import type { TopScores } from '../platform/games';
import { Hud } from './hud';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function orb(id: CharacterId, big = false): string {
  const c = getCharacter(id);
  return `<div class="orb ${big ? 'big' : ''} ${c.look !== 'plain' ? c.look : ''}" style="--c:${c.color}"></div>`;
}

function pips(level: number, max: number, next = false): string {
  let s = '<div class="pips">';
  for (let i = 0; i < max; i++) s += `<i class="${i < level ? 'on' : next && i === level ? 'next' : ''}"></i>`;
  return s + '</div>';
}

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(r).padStart(2, '0')}`;
}

function fusionNames(req: Partial<Record<UpgradeId, number>>): { a: string; b: string } {
  const [a, b] = Object.keys(req) as UpgradeId[];
  return { a: t(`upgrade.${a}.name` as I18nKey), b: t(`upgrade.${b}.name` as I18nKey) };
}

/** Fills placeholders of an upgrade description for the given (next) level. */
export function upgradeDesc(id: UpgradeId, level: number): string {
  const key = `upgrade.${id}.desc` as I18nKey;
  switch (id) {
    case 'shockwave':
      return t(key, { v: UPGRADE_VALUES.shockRadius(level) });
    case 'frost':
      return t(key, { v: fmt(UPGRADE_VALUES.frostTime(level), 1), p: Math.round((1 - UPGRADE_VALUES.frostSlow(level)) * 100) });
    case 'chain':
      return t(key, { v: level });
    case 'ember':
      return t(key, { v: fmt(UPGRADE_VALUES.emberTick(level), 2) });
    case 'shield':
      return t(key, { v: TUNING.shield.regen[Math.min(3, level)] });
    case 'echo':
      return t(key, { v: level });
    case 'slowmo':
      return t(key, { v: fmt(UPGRADE_VALUES.slowmoTime(level), 1) });
    case 'supernova':
      return t(key, { v: UPGRADE_VALUES.supernovaEvery(level) });
    case 'gravity':
      return t(key, { v: UPGRADE_VALUES.gravityRadius(level) });
    case 'orbit':
      return t(key, { v: level + 1 });
    default:
      return t(key);
  }
}

export class UI {
  readonly hud: Hud;
  private root: HTMLElement;
  private current: HTMLElement | null = null;
  private banner: HTMLElement;
  private toasts: HTMLElement;
  private tut: HTMLElement | null = null;
  private bannerTimer = 0;
  private toastQueue: { kicker: string; title: string; ico: string }[] = [];
  private toastBusy = false;
  screenName = '';

  constructor(private app: App) {
    this.root = document.getElementById('ui')!;
    this.banner = document.getElementById('banner')!;
    this.toasts = document.getElementById('toasts')!;
    this.hud = new Hud(document.getElementById('hud')!, () => app.pause(), () => app.pulse());
  }

  // ───────────────────────── Infrastructure ─────────────────────────

  private open(name: string, html: string, opts: { dim?: boolean; onAction?: (act: string, el: HTMLElement) => void } = {}): HTMLElement {
    this.close();
    const el = document.createElement('div');
    el.className = `screen ${opts.dim ? 'dim' : ''}`;
    el.dataset.screen = name;
    el.innerHTML = html;
    el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!target || target.hasAttribute('disabled')) return;
      opts.onAction?.(target.dataset.act!, target);
    });
    this.root.appendChild(el);
    this.current = el;
    this.screenName = name;
    return el;
  }

  close(): void {
    const old = this.current;
    if (!old) return;
    this.current = null;
    this.screenName = '';
    old.classList.add('leaving');
    setTimeout(() => old.remove(), 200);
  }

  /** Full-screen "loading…" hint (used while a native ad loads). */
  loading(on: boolean): void {
    let el = document.getElementById('loading');
    if (!on) {
      el?.remove();
      return;
    }
    if (el) return;
    el = document.createElement('div');
    el.id = 'loading';
    el.innerHTML = `<div class="spinner"></div><span>${t('ads.loading')}</span>`;
    document.body.appendChild(el);
  }

  /** Closes the top-most modal dialog (Android back button). Returns true if one was open. */
  closeTopDialog(): boolean {
    const dialogs = document.querySelectorAll<HTMLElement>('.dialog-wrap');
    const top = dialogs[dialogs.length - 1];
    if (!top || top.querySelector('.login, .cloud-choice')) return false;
    const cancel = top.querySelector<HTMLElement>('[data-act=no], [data-act=close]');
    if (cancel) cancel.click();
    else top.remove();
    return true;
  }

  /** Removes every open dialog (used when the whole save is swapped and their content is stale). */
  closeDialogs(): void {
    document.querySelectorAll('.dialog-wrap').forEach((w) => w.remove());
  }

  dialog(message: string, confirmLabel: string, onConfirm: () => void, danger = true): void {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog"><p>${esc(message)}</p><div class="grid2">
      <button class="btn ghost" data-act="no">${t('common.cancel')}</button>
      <button class="btn ${danger ? 'danger' : ''}" data-act="yes">${esc(confirmLabel)}</button></div></div>`;
    wrap.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (e.target === wrap || act === 'no') {
        this.app.audio.uiBack();
        wrap.remove();
      } else if (act === 'yes') {
        wrap.remove();
        onConfirm();
      }
    });
    document.body.appendChild(wrap);
  }

  showBanner(title: string, sub = '', boss = false, duration = 2100): void {
    this.banner.className = '';
    this.banner.innerHTML = `<div class="b-title">${esc(title)}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    void this.banner.offsetWidth;
    this.banner.className = `show ${boss ? 'boss' : ''}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.className = ''), duration);
  }

  clearBanner(): void {
    this.banner.className = '';
  }

  /**
   * Notifications are queued and shown one after another at the very top (over the HUD), so
   * several unlocks at once never bury the upgrade cards or the result screen.
   */
  toast(kicker: string, title: string, ico = 'trophy'): void {
    if (this.toastQueue.length > 8) this.toastQueue.shift();
    this.toastQueue.push({ kicker, title, ico });
    if (!this.toastBusy) this.nextToast();
  }

  private nextToast(): void {
    const next = this.toastQueue.shift();
    if (!next) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="ico-wrap">${icon(next.ico, 20)}</div><div><div class="t1">${esc(next.kicker)}</div><div class="t2">${esc(next.title)}</div></div>`;
    this.toasts.appendChild(el);
    // Shorter when more are waiting.
    const ms = this.toastQueue.length ? 1900 : 2900;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
      this.nextToast();
    }, ms);
  }

  newEnemyText(type: EnemyType): string {
    return `<b>${esc(t('banner.newEnemy', { name: t(`enemy.${type}` as I18nKey) }))}</b> – ${esc(t(`hint.${type}` as I18nKey))}`;
  }

  // ───────────────────────── Shared bits ─────────────────────────

  /** Re-renders the current menu screen after balances changed (purchases, rewards). */
  refresh(): void {
    const name = this.screenName;
    if (this.app.state !== 'menu' && this.app.state !== 'gameover') return;
    if (name === 'menu') this.showMenu();
    else if (name === 'shop') this.showShop();
    else if (name === 'sparks') this.showSparks();
    else if (name === 'workshop') this.showWorkshop();
    else if (name === 'missions') this.showMissions();
    else if (name === 'pass') this.showPass();
  }

  private wallet(): string {
    const s = this.app.save.data;
    return `<div class="wallet">
      <button class="pill" data-act="shop" aria-label="${t('menu.shop')}">${icon('shard', 15)}<span>${fmtShort(s.bank)}</span></button>
      <button class="pill gem" data-act="shop" aria-label="${t('menu.shop')}">${icon('gem', 15)}<span>${fmtShort(s.diamonds)}</span><b class="plus">+</b></button>
    </div>`;
  }

  private price(currency: Currency, amount: number): string {
    return `<span class="price ${currency === 'diamonds' ? 'gem' : ''}">${icon(currency === 'coins' ? 'shard' : 'gem', 14)}${fmt(amount)}</span>`;
  }

  /** A diamond cost with its real-money value (not used for rewards). */
  private gemCost(amount: number, stacked = false): string {
    if (!SHOW_MONEY_VALUES) return this.price('diamonds', amount);
    return `<span class="gem-cost ${stacked ? 'stacked' : ''}">${this.price('diamonds', amount)}<span class="eur">≈ ${esc(this.app.diamondValue(amount))}</span></span>`;
  }

  private rewardChips(r: Reward): string {
    return `${r.coins ? this.price('coins', r.coins) : ''}${r.diamonds ? this.price('diamonds', r.diamonds) : ''}`;
  }

  /** Common handler for wallet/shop buttons that appear on many screens. */
  private walletAction(act: string): boolean {
    if (act === 'shop') {
      this.app.audio.uiClick();
      this.showShop();
      return true;
    }
    return false;
  }

  // ───────────────────────── Menu ─────────────────────────

  showMenu(): void {
    const s = this.app.save.data;
    const daily = this.app.dailyInfo();
    const dailyPlayed = s.daily.date === daily.date;
    const weeklyPlayed = s.weekly.week === weekOf(localDateKey()) && s.weekly.best > 0;
    const canAffordAny = anyMetaBuyable(s);
    const missions = missionsClaimable(s);
    const freeAds = this.app.freeDiamondsLeft() > 0;
    const need = xpForLevel(s.level);
    const html = `
      <div class="topbar">
        <button class="icon-btn" data-act="settings" aria-label="${t('menu.settings')}">${icon('gear')}</button>
        <button class="level-chip" data-act="levels" aria-label="${t('levels.title')}"><b>${s.level}</b><span><i style="width:${Math.round((s.xp / need) * 100)}%"></i></span></button>
        ${this.wallet()}
      </div>
      <div class="screen-inner">
        <div class="logo"><h1><span>LUMEN</span><span>LOOP</span></h1><p>${t('app.tagline')}</p></div>
        <button class="char-chip" data-act="sparks">${orb(s.selected)}<span>${t(`char.${s.selected}.name` as I18nKey)}</span></button>
        <button class="btn primary" data-act="play">${icon('play', 22)}${t('menu.play')}</button>
        <div class="feature-row">${this.campaignCard()}${this.passBar()}</div>
        <div class="grid3">
          <button class="btn" data-act="missions">${icon('target', 24)}${t('menu.missions')}${missions ? `<span class="count">${missions}</span>` : ''}</button>
          <button class="btn" data-act="daily">${icon('calendar', 24)}${t('menu.events')}${dailyPlayed && weeklyPlayed ? '' : '<span class="badge"></span>'}</button>
          <button class="btn shop-btn" data-act="shop">${icon('shop', 24)}${t('menu.shop')}${freeAds ? '<span class="badge"></span>' : ''}</button>
          <button class="btn" data-act="workshop">${icon('wrench', 24)}${t('menu.workshop')}${canAffordAny ? '<span class="badge"></span>' : ''}</button>
          <button class="btn" data-act="sparks">${icon('spark', 24)}${t('menu.sparks')}</button>
          <button class="btn" data-act="achievements">${icon('trophy', 24)}${t('menu.achievements')}</button>
        </div>
        <div class="records">
          <span>${t('menu.best')}: <b>${fmt(s.best)}</b></span>
          <span>${t('menu.bestWave')}: <b>${s.bestWave}</b></span>
        </div>
        ${this.app.canInstall ? `<button class="btn ghost small" data-act="install">${icon('download', 18)}${t('menu.install')}</button>` : ''}
        ${this.app.showIosHint ? `<div class="hint">${t('menu.installHint')}</div>` : ''}
      </div>`;
    this.open('menu', html, {
      onAction: (act) => {
        if (this.walletAction(act)) return;
        this.app.audio.uiClick();
        if (act === 'play') this.app.startRun(false);
        else if (act === 'daily') this.showEvents();
        else if (act === 'workshop') this.showWorkshop();
        else if (act === 'sparks') this.showSparks();
        else if (act === 'achievements') this.showAchievements();
        else if (act === 'missions') this.showMissions();
        else if (act === 'settings') this.showSettings('menu');
        else if (act === 'levels') this.showLevels();
        else if (act === 'pass') this.showPass();
        else if (act === 'campaign') this.showCampaign();
        else if (act === 'install') this.app.install();
      },
    });
  }

  private backBar(title: string, right = ''): string {
    return `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="${t('common.back')}">${icon('back')}</button><h2>${esc(title)}</h2>${right}</div>`;
  }

  private back(): void {
    this.app.audio.uiBack();
    this.showMenu();
  }

  // ───────────────────────── Campaign ─────────────────────────

  private stars(n: number, size = 14): string {
    return `<span class="stars">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}">${icon('starFill', size)}</i>`).join('')}</span>`;
  }

  /** Half-width entry next to the light pass. */
  private campaignCard(): string {
    const s = this.app.save.data;
    const lv = getLevel(nextLevel(s));
    return `<button class="campaign-card" data-act="campaign">
      <span class="cc-ico">${icon('map', 20)}</span>
      <span class="cc-body"><span class="cc-name">${t('campaign.title')}</span>
        <span class="cc-sub">${icon('starFill', 12)}${totalStars(s)}/${LEVEL_COUNT * 3} · ${lv.world + 1}-${lv.number}</span></span>
    </button>`;
  }

  showCampaign(world?: number): void {
    const s = this.app.save.data;
    const current = world ?? getLevel(nextLevel(s)).world;
    const worldOpen = (w: number) => levelUnlocked(s, w * LEVELS_PER_WORLD);
    const tabs = WORLDS.map((_, i) => {
      const open = worldOpen(i);
      return `<button class="world-tab ${i === current ? 'on' : ''}" data-act="world" data-w="${i}" ${open ? '' : 'disabled'}>
        <b>${i + 1}</b><span>${open ? `${icon('starFill', 11)}${worldStars(s, i)}/30` : icon('lock', 12)}</span></button>`;
    }).join('');
    const w = WORLDS[current];
    const tiles = Array.from({ length: LEVELS_PER_WORLD }, (_, k) => {
      const index = current * LEVELS_PER_WORLD + k;
      const open = levelUnlocked(s, index);
      const stars = levelStars(s, index);
      const boss = k === LEVELS_PER_WORLD - 1;
      return `<button class="level-tile ${boss ? 'boss' : ''} ${stars ? 'done' : ''} ${open && !stars ? 'next' : ''}" data-act="level" data-i="${index}" ${open ? '' : 'disabled'}>
        <b>${open ? k + 1 : icon('lock', 16)}</b>${open ? this.stars(stars, 11) : ''}</button>`;
    }).join('');
    const fresh = w.fresh.map((e) => t(`enemy.${e}` as I18nKey)).join(', ');
    const html = `${this.backBar(t('campaign.title'), this.wallet())}
      <div class="screen-inner top">
        <div class="world-tabs">${tabs}</div>
        <div class="panel world-head">
          <div class="wh-top"><span class="wh-name">${t(`biome.${['nebula', 'ember', 'deep', 'aurora', 'void', 'crystal'][w.biome]}` as I18nKey)}</span>
            <span class="wh-stars">${icon('starFill', 13)}${worldStars(s, current)}/30</span></div>
          <p class="hint">${t('campaign.worldInfo', { enemies: fresh, boss: t(`enemy.${w.boss === 'twins' ? 'twin' : w.boss}` as I18nKey) })}</p>
          <div class="level-grid">${tiles}</div>
        </div>
        <p class="hint" style="margin:0">${t('campaign.desc')}</p>
      </div>`;
    this.open('campaign', html, {
      onAction: (act, btn) => {
        if (this.walletAction(act)) return;
        if (act === 'back') this.back();
        else if (act === 'world') {
          this.app.audio.uiClick();
          this.showCampaign(Number(btn.dataset.w));
        } else if (act === 'level') {
          this.app.audio.uiClick();
          this.showLevelInfo(Number(btn.dataset.i));
        }
      },
    });
  }

  /** Level details before starting: rules and the three star goals. */
  private showLevelInfo(index: number): void {
    const s = this.app.save.data;
    const lv = getLevel(index);
    const best = levelStars(s, index);
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    const rules = lv.modifiers.length
      ? `<ul class="perk-chips neutral">${lv.modifiers.map((m) => `<li>${icon('star', 13)}<span>${esc(t(`mod.${m}.name` as I18nKey))}: ${esc(t(`mod.${m}.desc` as I18nKey))}</span></li>`).join('')}</ul>`
      : '';
    const goals = [t('campaign.star1'), t('campaign.star2'), t('campaign.star3', { n: fmt(lv.starScore) })]
      .map((g, i) => `<li class="${i < best ? 'done' : ''}">${icon(i < best ? 'check' : 'starFill', 15)}<span>${esc(g)}</span></li>`)
      .join('');
    wrap.innerHTML = `<div class="dialog level-info">
      <h2>${t('campaign.level', { w: lv.world + 1, n: lv.number })}</h2>
      ${this.stars(best, 22)}
      <p class="hint">${t('campaign.waves', { n: lv.waves.length })}${lv.number === LEVELS_PER_WORLD ? ' ' + t('campaign.bossLevel') : ''}</p>
      ${rules}
      <ul class="star-goals">${goals}</ul>
      <div class="grid2"><button class="btn ghost" data-act="close">${t('common.back')}</button>
        <button class="btn primary" data-act="go">${icon('play', 18)}${t('campaign.play')}</button></div>
    </div>`;
    wrap.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (e.target === wrap || act === 'close') {
        this.app.audio.uiBack();
        wrap.remove();
      } else if (act === 'go') {
        wrap.remove();
        this.app.startLevel(index);
      }
    });
    document.body.appendChild(wrap);
  }

  // ───────────────────────── Light pass ─────────────────────────

  /** Half-width entry next to the campaign: current tier, progress and a badge when rewards wait. */
  private passBar(): string {
    const s = this.app.save.data;
    const tier = passTier(s.pass.points);
    const into = tier >= PASS_TIERS ? 1 : (s.pass.points % PASS_XP_PER_TIER) / PASS_XP_PER_TIER;
    const ready = passClaimable(s);
    return `<button class="pass-bar" data-act="pass">
      <span class="pass-ico">${icon('crown', 20)}</span>
      <span class="pass-body"><span class="pass-name">${t('pass.title')}</span>
        <span class="pass-sub"><span class="pass-tier">${t('pass.tier', { n: tier, max: PASS_TIERS })}</span>
        <span class="pass-track"><i style="width:${Math.round(into * 100)}%"></i></span></span></span>
      ${ready ? `<span class="count">${ready}</span>` : ''}
    </button>`;
  }

  private passRewardHtml(r: PassReward): string {
    if (r.trail) return `<span class="pr-trail">${icon('trail', 15)}${esc(t(`trail.${r.trail}` as I18nKey))}</span>`;
    if (r.diamonds) return this.price('diamonds', r.diamonds);
    return this.price('coins', r.coins ?? 0);
  }

  showPass(): void {
    const s = this.app.save.data;
    const tier = passTier(s.pass.points);
    const premium = hasPremium(s);
    const into = tier >= PASS_TIERS ? PASS_XP_PER_TIER : s.pass.points % PASS_XP_PER_TIER;
    const ready = passClaimable(s);
    const cell = (n: number, track: PassTrack) => {
      const r = (track === 'free' ? PASS_FREE : PASS_PREMIUM)[n - 1];
      const claimed = (track === 'free' ? s.pass.free : s.pass.premium).includes(n);
      const can = canClaim(s, n, track);
      const lockedPremium = track === 'premium' && !premium;
      const cls = claimed ? 'claimed' : can ? 'ready' : 'locked';
      const mark = claimed ? icon('check', 15) : lockedPremium ? icon('lock', 13) : '';
      return `<button class="pass-cell ${track} ${cls}" data-act="claim" data-tier="${n}" data-track="${track}" ${can ? '' : 'disabled'}>
        ${this.passRewardHtml(r)}<span class="mark">${mark}</span></button>`;
    };
    const rows = Array.from({ length: PASS_TIERS }, (_, i) => i + 1)
      .map((n) => `<div class="pass-row ${n <= tier ? 'reached' : ''} ${n === tier + 1 ? 'next' : ''}">
        <span class="pass-num">${n}</span>${cell(n, 'free')}${cell(n, 'premium')}</div>`)
      .join('');
    const totals = premiumTotals();
    const buy = premium
      ? ''
      : `<div class="panel pass-premium">
          <div class="pp-head">${icon('crown', 22)}<span>${t('pass.premiumCard')}</span></div>
          <ul class="perks">
            <li>${icon('gem', 16)}<span>${esc(t('perk.diamonds', { n: fmt(totals.diamonds) }))}</span></li>
            <li>${icon('shard', 16)}<span>${esc(t('perk.coins', { n: fmt(totals.coins) }))}</span></li>
            <li>${icon('trail', 16)}<span>${esc(t('pass.trails', { names: totals.trails.map((id) => t(`trail.${id}` as I18nKey)).join(', ') }))}</span></li>
            <li>${icon('check', 16)}<span>${esc(t('pass.retro'))}</span></li>
          </ul>
          <button class="btn buy" data-act="buypass">${icon('crown', 18)}${esc(this.app.priceOf('light_pass'))}</button>
        </div>`;
    const html = `${this.backBar(t('pass.title'), this.wallet())}
      <div class="screen-inner top">
        <div class="panel pass-head">
          <div class="ph-top"><span class="ph-season">${t('pass.season', { n: s.pass.season })}</span>
            <span class="ph-days">${t('pass.daysLeft', { n: seasonDaysLeft(localDateKey()) })}</span></div>
          <div class="ph-tier">${t('pass.tier', { n: tier, max: PASS_TIERS })}${premium ? `<span class="premium-tag">${t('pass.premiumTag')}</span>` : ''}</div>
          <span class="xpbar"><i style="width:${Math.round((into / PASS_XP_PER_TIER) * 100)}%"></i></span>
          <div class="desc">${tier >= PASS_TIERS ? t('pass.done') : t('pass.xp', { n: fmt(into), max: fmt(PASS_XP_PER_TIER) })}</div>
          ${ready ? `<button class="btn primary small" data-act="claimall">${icon('gift', 18)}${t('pass.claimAll', { n: ready })}</button>` : ''}
        </div>
        ${buy}
        <p class="hint" style="margin:0">${t('pass.desc')}</p>
        <div class="pass-cols"><span></span><span>${t('pass.free')}</span><span>${t('pass.premium')}</span></div>
        <div class="pass-list">${rows}</div>
      </div>`;
    this.open('pass', html, {
      onAction: (act, btn) => {
        if (this.walletAction(act)) return;
        if (act === 'back') this.back();
        else if (act === 'claim') {
          if (this.app.claimPassTier(Number(btn.dataset.tier), btn.dataset.track as PassTrack)) this.showPass();
        } else if (act === 'claimall') {
          if (this.app.claimAllPassRewards()) this.showPass();
        } else if (act === 'buypass') {
          this.app.audio.uiClick();
          void this.app.buyProduct('light_pass').then(() => {
            if (this.screenName === 'pass') this.showPass();
          });
        }
      },
    });
  }

  // ───────────────────────── Level path ─────────────────────────

  unlockName(u: Unlock): string {
    if (u.kind === 'char') return t(`char.${u.id}.name` as I18nKey);
    if (u.kind === 'upgrade') return t('unlock.upgrade', { name: t(`upgrade.${u.id}.name` as I18nKey) });
    if (u.kind === 'mode') return t('unlock.mode', { name: t(`mode.${u.id}.name` as I18nKey) });
    const name = t(`meta.${u.id}.name` as I18nKey);
    return u.rank <= 1 ? t('unlock.workshop', { name }) : t('unlock.metaRank', { name, n: u.rank });
  }

  unlockIcon(u: Unlock, size: number): string {
    if (u.kind === 'char') return `<i class="mini-orb" style="--c:${getCharacter(u.id).color}"></i>`;
    if (u.kind === 'mode') return icon(u.id === 'blitz' ? 'bolt' : 'target', size);
    return icon(u.kind === 'meta' ? `meta.${u.id}` : u.id, size);
  }

  showLevels(): void {
    const s = this.app.save.data;
    const need = xpForLevel(s.level);
    const next = nextUnlockLevel(s.level);
    const steps = levelPath()
      .map((st) => {
        const reached = s.level >= st.level;
        const chips = st.unlocks.map((u) => `<span class="chip">${this.unlockIcon(u, 15)}${esc(this.unlockName(u))}</span>`).join('');
        return `<div class="lvl-step ${reached ? 'done' : st.level === next ? 'next' : ''}">
          <div class="lvl-badge">${reached ? icon('check', 16) : st.level}</div>
          <div class="body"><div class="name">${t('menu.level', { n: st.level })}</div><div class="chips">${chips}</div></div></div>`;
      })
      .join('');
    const html = `${this.backBar(t('levels.title'))}
      <div class="screen-inner top">
        <div class="panel level-head">
          <div class="lvl-big">${s.level}</div>
          <div class="body"><div class="name">${t('menu.level', { n: s.level })}</div>
            <span class="xpbar"><i style="width:${Math.round((s.xp / need) * 100)}%"></i></span>
            <div class="desc">${t('levels.xp', { n: fmt(s.xp), max: fmt(need) })}</div></div>
        </div>
        <p class="hint" style="margin:0">${t('levels.desc')}</p>
        <div class="lvl-path">${steps}</div>
      </div>`;
    const el = this.open('levels', html, {
      onAction: (act) => {
        if (act === 'back') this.back();
      },
    });
    // Bring the next goal into view, but keep the header when it is already visible.
    el.querySelector('.lvl-step.next')?.scrollIntoView({ block: 'nearest' });
  }

  /** "What's new" after an app update. */
  showWhatsNew(onClose: () => void): void {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    // The Play Games line only when Play Games is set up in this build.
    const keys: I18nKey[] = ['news.1', 'news.2', 'news.3', ...(this.app.games.configured ? (['news.4'] as I18nKey[]) : []), 'news.5'];
    const items = keys.map((k) => `<li>${esc(t(k))}</li>`).join('');
    wrap.innerHTML = `<div class="dialog news">
      <div class="news-icon">${icon('news', 30)}</div>
      <h2>${t('news.title', { v: __APP_VERSION__ })}</h2>
      <ul>${items}</ul>
      <button class="btn primary" data-act="close">${t('news.ok')}</button>
    </div>`;
    wrap.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act=close]')) {
        this.app.audio.uiClick();
        wrap.remove();
        onClose();
      }
    });
    document.body.appendChild(wrap);
  }

  // ───────────────────────── Preparation (boosters) ─────────────────────────

  showPrerun(daily: boolean, weekly = false): void {
    const s = this.app.save.data;
    const available = availableBoosters(s).map((b) => b.id);
    let selected = s.boosters.filter((b) => available.includes(b));
    const charId = daily ? this.app.dailyInfo().character : s.selected;
    let mode: GameMode = !daily && getMode(s.mode).unlockLevel <= s.level ? s.mode : 'normal';
    const modePicker = () => {
      if (daily || weekly) return '';
      const buttons = MODES.map((m) => {
        const locked = m.unlockLevel > s.level;
        return `<button class="${m.id === mode ? 'on' : ''}" data-act="mode" data-id="${m.id}" ${locked ? 'disabled' : ''}>
          <span>${t(`mode.${m.id}.name` as I18nKey)}</span>${locked ? `<small>${icon('lock', 11)}${t('common.levelReq', { n: m.unlockLevel })}</small>` : ''}</button>`;
      }).join('');
      const best = mode === 'normal' ? s.best : s.modeBest[mode];
      return `<div class="panel"><h3>${t('mode.title')}</h3><div class="mode-seg">${buttons}</div>
        <p class="mode-info">${t(`mode.${mode}.desc` as I18nKey)} ${best > 0 ? t('mode.best', { n: fmt(best) }) : ''}</p></div>`;
    };

    const render = () => {
      const cost = boosterCost(selected);
      const affordable = s.bank >= (cost.coins ?? 0) && s.diamonds >= (cost.diamonds ?? 0);
      const items = BOOSTERS.map((b) => {
        const unlocked = available.includes(b.id);
        const on = selected.includes(b.id);
        return `<button class="booster ${on ? 'on' : ''}" data-act="toggle" data-id="${b.id}" ${unlocked ? '' : 'disabled'} aria-pressed="${on}">
          <span class="ico-wrap">${icon(`booster.${b.id}`, 24)}</span>
          <span class="body"><span class="name">${t(`booster.${b.id}.name` as I18nKey)}</span>
          <span class="desc">${unlocked ? t(`booster.${b.id}.desc` as I18nKey) : t('prerun.locked', { n: b.requiresWave })}</span></span>
          ${b.currency === 'diamonds' ? this.gemCost(b.price, true) : this.price(b.currency, b.price)}<span class="check">${icon('check', 18)}</span>
        </button>`;
      }).join('');
      const costText =
        cost.coins || cost.diamonds
          ? `${t('prerun.cost')} ${cost.coins ? this.price('coins', cost.coins) : ''}${cost.diamonds ? this.gemCost(cost.diamonds) : ''}`
          : '';
      return `${this.backBar(t('prerun.title'), this.wallet())}
        <div class="screen-inner">
          <button class="char-chip" data-act="${daily ? 'none' : 'sparks'}">${orb(charId)}<span>${t(`char.${charId}.name` as I18nKey)}</span>
            ${daily ? '' : `<small>${t('prerun.changeSpark')}</small>`}</button>
          ${modePicker()}
          <div class="panel"><h3>${t('prerun.boosters')}</h3><div class="boosters">${items}</div></div>
          <div class="records">${costText}</div>
          <button class="btn primary" data-act="start" ${affordable ? '' : 'disabled'}>${icon('play', 22)}${t('prerun.start')}</button>
          ${affordable ? '' : `<p class="hint">${t('common.notEnough', { c: t(s.bank < (cost.coins ?? 0) ? 'currency.coins' : 'currency.diamonds') })}</p>`}
        </div>`;
    };
    const el = this.open('prerun', render(), {
      onAction: (act, btn) => {
        if (this.walletAction(act)) return;
        if (act === 'back') this.back();
        else if (act === 'sparks') {
          this.app.audio.uiClick();
          this.showSparks(() => this.showPrerun(daily, weekly));
        } else if (act === 'toggle') {
          const id = btn.dataset.id as BoosterId;
          selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
          this.app.audio.uiClick();
          el.innerHTML = render();
        } else if (act === 'mode') {
          mode = btn.dataset.id as GameMode;
          this.app.audio.uiClick();
          el.innerHTML = render();
        } else if (act === 'start') {
          this.app.audio.uiSelect();
          if (!this.app.launchRun(daily, selected, mode, weekly)) el.innerHTML = render();
        }
      },
    });
  }

  // ───────────────────────── Daily ─────────────────────────

  /** Events: today's challenge and this week's event. */
  showEvents(): void {
    const s = this.app.save.data;
    const today = localDateKey();
    // Daily challenge
    const d = this.app.dailyInfo();
    const c = getCharacter(d.character);
    const dailyBest = s.daily.date === d.date ? fmt(s.daily.best) : t('daily.none');
    const modChips = (mods: string[]) =>
      `<ul class="perk-chips neutral">${mods.map((m) => `<li>${icon('star', 13)}<span>${esc(t(`mod.${m}.name` as I18nKey))}</span></li>`).join('')}</ul>`;
    // Weekly event
    const week = weekOf(today);
    const theme = weeklyTheme(week);
    const weekBest = s.weekly.week === week ? s.weekly.best : 0;
    const reached = s.weekly.week === week ? s.weekly.reached : 0;
    const medals = ['bronze', 'silver', 'gold'];
    const goals = theme.goals
      .map((g, i) => `<div class="goal ${i < reached ? 'done' : ''}">
        <span class="medal ${medals[i]}">${icon(i < reached ? 'check' : 'trophy', 16)}</span>
        <span class="goal-score">${t('weekly.goal', { n: fmt(g) })}</span>${this.rewardChips(WEEKLY_REWARDS[i])}</div>`)
      .join('');
    const html = `${this.backBar(t('events.title'))}
      <div class="screen-inner top">
        <div class="panel event-card">
          <div class="ev-head"><span class="ev-title">${t('daily.title')}</span><span class="ev-when">${t('events.today')}</span></div>
          <p class="hint">${t('daily.desc')}</p>
          <div class="ev-spark">${orb(c.id)}<span>${t(`char.${c.id}.name` as I18nKey)}</span></div>
          ${modChips(d.modifiers)}
          <div class="ev-foot"><span>${t('daily.best')}: <b>${dailyBest}</b></span>
            <button class="btn small primary" data-act="daily">${icon('play', 16)}${t('daily.start')}</button></div>
        </div>
        <div class="panel event-card weekly">
          <div class="ev-head"><span class="ev-title">${t(`weekly.${theme.id}.name` as I18nKey)}</span>
            <span class="ev-when">${t('pass.daysLeft', { n: weeklyDaysLeft(today) })}</span></div>
          <p class="hint">${t(`weekly.${theme.id}.desc` as I18nKey)} ${t('weekly.free')}</p>
          ${modChips(theme.modifiers)}
          <div class="goals">${goals}</div>
          <div class="ev-foot"><span>${t('weekly.best')}: <b>${fmt(weekBest)}</b></span>
            <button class="btn small primary" data-act="weekly">${icon('play', 16)}${t('daily.start')}</button></div>
        </div>
        <div class="panel event-card challenge">
          <div class="ev-head"><span class="ev-title">${t('challenge.title')}</span></div>
          <p class="hint">${t('challenge.desc')}</p>
          <div class="code-row"><input id="challenge-code" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${t('challenge.placeholder')}" aria-label="${t('challenge.title')}" />
            <button class="btn small primary" data-act="accept">${t('challenge.accept')}</button></div>
          <p class="hint code-error" hidden>${t('challenge.invalid')}</p>
        </div>
      </div>`;
    this.open('events', html, {
      onAction: (act) => {
        if (act === 'back') this.back();
        else if (act === 'daily') {
          this.app.audio.uiSelect();
          this.app.startRun(true);
        } else if (act === 'weekly') {
          this.app.audio.uiSelect();
          this.app.startRun(false, true);
        } else if (act === 'accept') {
          const field = document.getElementById('challenge-code') as HTMLInputElement | null;
          if (!this.app.startChallenge(field?.value ?? '')) {
            document.querySelector<HTMLElement>('.code-error')?.removeAttribute('hidden');
          }
        }
      },
    });
  }

  // ───────────────────────── Shop ─────────────────────────

  showShop(): void {
    const s = this.app.save.data;
    this.app.refreshPrices();
    const left = this.app.freeDiamondsLeft();
    const offer = (id: ProductId, desc: string) => {
      const owned = (id === 'no_ads' && s.owned.noAds) || (id === 'starter_pack' && s.owned.starter);
      return `<div class="offer ${id === 'starter_pack' ? 'starter' : ''}">
        <div class="ico-wrap">${icon(id === 'no_ads' ? 'shieldB' : 'gift', 28)}</div>
        <div class="body"><div class="name">${t(`shop.product.${id}` as I18nKey)}</div><div class="desc">${desc}</div></div>
        <button class="btn small buy" data-act="buy" data-id="${id}" ${owned ? 'disabled' : ''}>${owned ? t('shop.owned') : esc(this.app.priceOf(id))}</button>
      </div>`;
    };
    const packs = PRODUCTS.filter((p) => p.id.startsWith('diamonds_'))
      .map(
        (p) => `<button class="pack ${p.badge ?? ''}" data-act="buy" data-id="${p.id}">
          ${p.badge ? `<span class="tag">${t(p.badge === 'best' ? 'shop.best' : 'shop.popular')}</span>` : ''}
          <span class="gemstack">${icon('gem', 30)}</span>
          <span class="amount">${fmt(p.reward.diamonds ?? 0)}</span>
          <span class="label">${t(`shop.product.${p.id}` as I18nKey)}</span>
          ${p.bonusPct ? `<span class="bonus">${t('shop.bonus', { n: p.bonusPct })}</span>` : '<span class="bonus"></span>'}
          <span class="cost">${esc(this.app.priceOf(p.id))}</span>
        </button>`,
      )
      .join('');
    const exchange = EXCHANGE.map(
      (x, i) => `<button class="btn small" data-act="exchange" data-i="${i}" ${s.diamonds >= x.diamonds ? '' : 'disabled'}>
        ${this.gemCost(x.diamonds)} → ${this.price('coins', x.coins)}</button>`,
    ).join('');
    const html = `${this.backBar(t('shop.title'), this.wallet())}
      <div class="screen-inner top">
        ${this.app.platform.demo ? `<p class="demo-note">${t('shop.demo')}</p>` : ''}
        <div class="item free-ad">
            <div class="ico-wrap">${icon('ad', 26)}</div>
            <div class="body"><div class="name">${t('shop.freeAd', { n: FREE_DIAMOND_AD_REWARD })}</div>
              <div class="desc">${left > 0 ? t('shop.freeAdSub', { n: left }) : t('shop.freeAdNone')}</div></div>
            <button class="btn small" data-act="freead" ${left > 0 ? '' : 'disabled'}>${icon('play', 16)}${t('common.free')}</button>
          </div>
        ${s.chars.includes('aurora') ? '' : this.exclusiveOffer()}
        <div class="panel"><h3>${t('shop.offers')}</h3><div class="list">
          ${offer('starter_pack', t('shop.starterDesc'))}
          ${
            hasPremium(s)
              ? ''
              : `<div class="offer pass-offer"><div class="ico-wrap">${icon('crown', 28)}</div>
              <div class="body"><div class="name">${t('pass.premiumCard')}</div><div class="desc">${t('shop.passDesc')}</div></div>
              <button class="btn small buy" data-act="openpass">${t('shop.view')}</button></div>`
          }
          ${offer('no_ads', t('shop.noAdsDesc'))}
        </div></div>
        <div class="panel"><h3>${t('shop.diamonds')}</h3><div class="packs">${packs}</div></div>
        <div class="panel"><h3>${t('shop.exchange')}</h3><div class="exchange">${exchange}</div></div>
        <button class="btn ghost small" data-act="restore">${icon('refresh', 16)}${t('shop.restore')}</button>
        <p class="hint">${t('shop.legal')}</p>
      </div>`;
    this.open('shop', html, {
      onAction: (act, btn) => {
        if (act === 'back') this.back();
        else if (act === 'buy') {
          this.app.audio.uiClick();
          void this.app.buyProduct(btn.dataset.id as ProductId).then(() => this.refresh());
        } else if (act === 'openpass') {
          this.app.audio.uiClick();
          this.showPass();
        } else if (act === 'freead') {
          void this.app.freeDiamonds().then(() => this.refresh());
        } else if (act === 'exchange') {
          if (this.app.exchange(Number(btn.dataset.i))) this.showShop();
        } else if (act === 'restore') {
          this.app.audio.uiClick();
          void this.app.restoreEntitlements(false);
        }
      },
    });
  }

  /** What a spark brings (and costs), generated from its definition so text and game never drift apart. */
  private sparkPerks(id: CharacterId): { ico: string; text: string; minus?: boolean }[] {
    const c = getCharacter(id);
    const pct = (m: number) => Math.round(Math.abs(m - 1) * 100);
    const out: { ico: string; text: string; minus?: boolean }[] = [];
    const innate = (ico: string, name: I18nKey) => out.push({ ico, text: t('perk.innate', { name: t(name) }) });
    if (c.heartsDelta > 0) out.push({ ico: 'heart', text: t('perk.hearts', { n: c.heartsDelta }) });
    if (c.secondWind) out.push({ ico: 'secondwind', text: t('perk.secondWind') });
    if (c.startEpic) out.push({ ico: 'star', text: t('perk.startEpic') });
    if (c.phase) out.push({ ico: 'shield', text: t('perk.phase') });
    if (c.innateEcho) innate('echo', 'upgrade.echo.name');
    if (c.innateChain) innate('chain', 'upgrade.chain.name');
    if (c.innateShockwave) innate('shockwave', 'upgrade.shockwave.name');
    if (c.innateFrost) innate('frost', 'upgrade.frost.name');
    if (c.innateEmber) innate('ember', 'upgrade.ember.name');
    if (c.cometCharge) out.push({ ico: 'pulsecharge', text: t('perk.cometCharge') });
    if (c.shardMul > 1) out.push({ ico: 'shard', text: t('perk.shards', { n: pct(c.shardMul) }) });
    if (c.scoreMul > 1) out.push({ ico: 'stardust', text: t('perk.score', { n: pct(c.scoreMul) }) });
    if (c.hitMul < 1) out.push({ ico: 'nimble', text: t('perk.hitbox', { n: pct(c.hitMul) }) });
    if (c.trailMul > 1) out.push({ ico: 'trail', text: t('perk.trail', { n: pct(c.trailMul) }) });
    if (c.lifeMul > 1) out.push({ ico: 'afterglow', text: t('perk.trailLife', { n: pct(c.lifeMul) }) });
    if (c.pulseRadiusMul > 1) out.push({ ico: 'pulsecharge', text: t('perk.pulseSize', { n: pct(c.pulseRadiusMul) }) });
    if (c.pulseGainMul > 1) out.push({ ico: 'bolt', text: t('perk.pulseGain', { n: pct(c.pulseGainMul) }) });
    if (c.heartsDelta < 0) out.push({ ico: 'heart', text: t('perk.heartsMinus', { n: -c.heartsDelta }), minus: true });
    if (c.trailMul < 1) out.push({ ico: 'trail', text: t('perk.trailMinus', { n: pct(c.trailMul) }), minus: true });
    if (c.lifeMul < 1) out.push({ ico: 'afterglow', text: t('perk.trailLifeMinus', { n: pct(c.lifeMul) }), minus: true });
    return out;
  }

  /** Trail designs: selected, owned, for sale or from the light pass. */
  private trailPicker(): string {
    const s = this.app.save.data;
    const c = getCharacter(s.selected);
    const tiles = TRAILS.map((tr) => {
      const owned = s.trails.includes(tr.id);
      const on = s.trail === tr.id;
      const glow = tr.glow ?? c.trail;
      const core = tr.core ?? c.color;
      const state = on
        ? `<span class="tstate on">${icon('check', 13)}${t('trails.active')}</span>`
        : owned
          ? `<span class="tstate">${t('common.select')}</span>`
          : tr.price > 0
            ? `<span class="tstate">${this.gemCost(tr.price, true)}</span>`
            : `<span class="tstate locked">${icon('lock', 12)}${t('pass.title')}</span>`;
      const disabled = !owned && tr.price <= 0;
      return `<button class="trail-tile ${on ? 'on' : ''}" data-act="trail" data-id="${tr.id}" ${disabled ? 'disabled' : ''}>
        <span class="swatch ${tr.style}" style="--g:${glow};--c:${core};--a:${tr.alt ?? glow}"></span>
        <span class="tname">${t(`trail.${tr.id}` as I18nKey)}</span>${state}</button>`;
    }).join('');
    return `<div class="panel"><h3>${t('trails.title')}</h3><div class="trail-grid">${tiles}</div></div>`;
  }

  /** Mastery progress of an owned spark: level, bar and current bonus. */
  private masteryLine(id: CharacterId): string {
    const xp = this.app.save.data.mastery[id] ?? 0;
    const lv = masteryLevel(xp);
    const max = lv >= MASTERY_MAX;
    const from = lv === 0 ? 0 : masteryXpFor(lv);
    const pct = max ? 100 : Math.round(((xp - from) / (masteryXpFor(lv + 1) - from)) * 100);
    const bonus = lv > 0 ? t('mastery.bonus', { n: Math.round(masteryBonus(lv) * 100) }) : '';
    return `<div class="mastery ${max ? 'max' : ''}"><div class="m-top"><span>${max ? t('mastery.master') : t('mastery.level', { n: lv, max: MASTERY_MAX })}</span><span class="m-bonus">${bonus}</span></div>
      <span class="m-bar"><i style="width:${pct}%"></i></span></div>`;
  }

  /** Ability chips on a spark card; a spark without any gets one neutral line. */
  private perkChips(id: CharacterId): string {
    const perks = this.sparkPerks(id);
    if (perks.length === 0) return `<p class="spark-plain">${t(`char.${id}.desc` as I18nKey)}</p>`;
    return `<ul class="perk-chips">${perks
      .map((p) => `<li class="${p.minus ? 'minus' : ''}">${icon(p.ico, 14)}<span>${esc(p.text)}</span></li>`)
      .join('')}</ul>`;
  }

  /** Featured store spark: shows what it does, what is included and the price. */
  private exclusiveOffer(): string {
    const { diamonds = 0, coins = 0 } = getProduct('spark_aurora').reward;
    const perks = this.sparkPerks('aurora').map((p) => `<li>${icon(p.ico, 16)}<span>${esc(p.text)}</span></li>`);
    if (diamonds) perks.push(`<li class="bonus">${icon('gem', 16)}<span>${esc(t('perk.diamonds', { n: fmt(diamonds) }))}</span></li>`);
    if (coins) perks.push(`<li class="bonus coins">${icon('shard', 16)}<span>${esc(t('perk.coins', { n: fmt(coins) }))}</span></li>`);
    return `<div class="panel exclusive-offer">
      <span class="tag">${t('sparks.exclusive')}</span>
      <div class="row">${orb('aurora', true)}
        <div class="body"><div class="name">${t('char.aurora.name')}</div><div class="desc">${t('shop.auroraDesc')}</div></div>
      </div>
      <ul class="perks">${perks.join('')}</ul>
      <button class="btn buy" data-act="buy" data-id="spark_aurora">${icon('crown', 18)}${esc(this.app.priceOf('spark_aurora'))}</button>
    </div>`;
  }

  // ───────────────────────── Missions ─────────────────────────

  showMissions(): void {
    const s = this.app.save.data;
    const items = s.missions.list
      .map((m, i) => {
        const done = m.progress >= m.target;
        const pct = Math.round((m.progress / m.target) * 100);
        return `<div class="item mission ${m.claimed ? 'claimed' : done ? 'ready' : ''}">
          <div class="ico-wrap">${icon(m.claimed ? 'check' : 'target', 22)}</div>
          <div class="body"><div class="name">${t(`mission.${m.type}` as I18nKey, { n: m.target })}</div>
            <div class="bar"><i style="width:${pct}%"></i></div>
            <div class="desc">${t('missions.progress', { n: fmt(m.progress), max: fmt(m.target) })} · ${this.rewardChips(m.reward)}</div></div>
          <button class="btn small" data-act="claim" data-i="${i}" ${done && !m.claimed ? '' : 'disabled'}>${m.claimed ? t('missions.claimed') : t('missions.claim')}</button>
        </div>`;
      })
      .join('');
    const bonusReady = canClaimMissionBonus(s);
    const html = `${this.backBar(t('menu.missions'), this.wallet())}
      <div class="screen-inner top">
        <p class="hint" style="margin:0">${t('missions.desc')}</p>
        <div class="list">${items}</div>
        <div class="panel"><div class="item">
          <div class="ico-wrap">${icon('gift', 24)}</div>
          <div class="body"><div class="name">${t('missions.bonus')}</div><div class="desc">${this.rewardChips(MISSION_BONUS)}</div></div>
          <button class="btn small" data-act="bonus" ${bonusReady ? '' : 'disabled'}>${s.missions.bonusClaimed ? t('missions.claimed') : t('missions.claim')}</button>
        </div></div>
      </div>`;
    this.open('missions', html, {
      onAction: (act, btn) => {
        if (this.walletAction(act)) return;
        if (act === 'back') this.back();
        else if (act === 'claim') {
          if (this.app.claimMission(Number(btn.dataset.i))) this.showMissions();
        } else if (act === 'bonus') {
          if (this.app.claimMissionBonus()) this.showMissions();
        }
      },
    });
  }

  // ───────────────────────── Daily login ─────────────────────────

  showLogin(day: number, onClaim: () => void): void {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    const days = LOGIN_REWARDS.map(
      (r, i) => `<div class="day ${i < day ? 'past' : i === day ? 'today' : ''} ${i === 6 ? 'big' : ''}">
        <small>${t('login.day', { n: i + 1 })}</small>${icon(r.diamonds ? 'gem' : 'shard', i === 6 ? 30 : 22, r.diamonds ? 'gemc' : '')}
        <b>${r.diamonds ? fmt(r.diamonds) : fmt(r.coins ?? 0)}</b>${i === 6 && r.coins ? `<small>+${fmt(r.coins)}</small>` : ''}</div>`,
    ).join('');
    wrap.innerHTML = `<div class="dialog login">
      <h2>${t('login.title')}</h2>
      <div class="days">${days}</div>
      <p class="hint" style="margin:0">${t('login.desc')}</p>
      <button class="btn primary" data-act="claim">${icon('gift', 20)}${t('login.claim')} ${this.rewardChips(LOGIN_REWARDS[day])}</button>
    </div>`;
    wrap.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act=claim]')) {
        wrap.remove();
        onClaim();
      }
    });
    document.body.appendChild(wrap);
  }

  // ───────────────────────── Workshop ─────────────────────────

  showWorkshop(): void {
    const s = this.app.save.data;
    const items = META.map((m) => {
      const lv = s.meta[m.id] ?? 0;
      const maxed = lv >= m.max;
      const cost = metaCost(m, lv);
      const gems = diamondsForCoins(cost);
      const afford = s.bank >= cost;
      const req = metaLevelReq(m, lv);
      const hidden = m.unlock > s.level;
      const gated = !maxed && req > s.level;
      let btn: string;
      if (maxed) btn = `<button class="btn small" disabled>${t('common.max')}</button>`;
      else if (gated) btn = `<button class="btn small lvl-lock" disabled>${icon('lock', 15)}${t('common.levelReq', { n: req })}</button>`;
      else {
        // Shards are always the main price; diamonds only offer to skip the saving up.
        btn = `<div class="buy-col">
          <button class="btn small ${afford ? '' : 'short'}" data-act="buy" data-id="${m.id}" ${afford ? '' : 'disabled'}>${this.price('coins', cost)}</button>
          ${afford ? '' : `<button class="btn small gem-btn mini" data-act="instant" data-id="${m.id}" ${s.diamonds >= gems ? '' : 'disabled'}><small>${t('workshop.instant')}</small>${this.gemCost(gems, true)}</button>`}
        </div>`;
      }
      return `<div class="item ${hidden ? 'locked' : ''}">
        <div class="ico-wrap">${icon(hidden ? 'lock' : `meta.${m.id}`, 24)}</div>
        <div class="body"><div class="name">${t(`meta.${m.id}.name` as I18nKey)}</div>
          <div class="desc">${this.metaDesc(m.id)}</div>${pips(lv, m.max)}</div>
        ${btn}
      </div>`;
    }).join('');
    const html = `${this.backBar(t('workshop.title'), this.wallet())}
      <div class="screen-inner top"><p class="hint" style="margin:0">${t('workshop.desc')}</p><div class="list ws">${items}</div></div>`;
    this.open('workshop', html, {
      onAction: (act, el) => {
        if (this.walletAction(act)) return;
        if (act === 'back') this.back();
        else if (act === 'buy') {
          if (this.app.buyMeta(el.dataset.id as MetaId, 'coins')) this.showWorkshop();
        } else if (act === 'instant') {
          if (this.app.buyMeta(el.dataset.id as MetaId, 'diamonds')) this.showWorkshop();
        }
      },
    });
  }

  private metaDesc(id: MetaId): string {
    const pct = (v: number) => Math.round(v * 100);
    if (id === 'combo') return t('meta.combo.desc', { n: fmt(META_VALUES.combo(1), 2) });
    if (id === 'score') return t('meta.score.desc', { n: pct(META_VALUES.score(1)) });
    if (id === 'wisdom') return t('meta.wisdom.desc', { n: pct(META_VALUES.wisdom(1)) });
    return t(`meta.${id}.desc` as I18nKey);
  }

  // ───────────────────────── Sparks ─────────────────────────

  showSparks(returnTo?: () => void): void {
    const s = this.app.save.data;
    const goBack = returnTo ?? (() => this.back());
    const bar = (label: string, v: number, color: string) =>
      `<span>${label}</span><div class="bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%;--c:${color}"></i></div>`;
    const cards = CHARACTERS.map((c) => {
      const owned = s.chars.includes(c.id);
      const sel = s.selected === c.id;
      const hearts = (TUNING.player.hearts + c.heartsDelta) / 4;
      let btn: string;
      const product = PRODUCTS.find((p) => p.unlocks === c.id && p.id !== 'starter_pack');
      if (sel) btn = `<button class="btn small" disabled>${icon('check', 18)}${t('common.selected')}</button>`;
      else if (owned) btn = `<button class="btn small" data-act="select" data-id="${c.id}">${t('common.select')}</button>`;
      else if (c.exclusive && product)
        btn = `<button class="btn small buy exclusive-buy" data-act="iap" data-id="${product.id}">${icon('crown', 16)}${esc(this.app.priceOf(product.id))}</button>`;
      else if (c.unlockLevel > s.level) btn = `<button class="btn small lvl-lock" disabled>${icon('lock', 15)}${t('common.levelReq', { n: c.unlockLevel })}</button>`;
      else {
        const coinBtn = c.price > 0 ? `<button class="btn small" data-act="buy" data-cur="coins" data-id="${c.id}" ${s.bank >= c.price ? '' : 'disabled'}>${icon('lock', 15)}${this.price('coins', c.price)}</button>` : '';
        const gemBtn = `<button class="btn small gem-btn" data-act="buy" data-cur="diamonds" data-id="${c.id}" ${s.diamonds >= c.diamondPrice ? '' : 'disabled'}>${this.gemCost(c.diamondPrice)}</button>`;
        btn = `<div class="buy-row">${coinBtn}${coinBtn ? `<span class="or">${t('common.or')}</span>` : ''}${gemBtn}</div>`;
      }
      const tag = c.exclusive
        ? `<span class="premium-tag exclusive">${t('sparks.exclusive')}</span>`
        : c.premium
          ? `<span class="premium-tag">${t('sparks.premium')}</span>`
          : c.unlockLevel >= 50
            ? `<span class="premium-tag legend">${t('sparks.legend')}</span>`
            : '';
      const locked = !owned && !c.exclusive && c.unlockLevel > s.level;
      const master = owned && masteryLevel(s.mastery[c.id] ?? 0) >= MASTERY_MAX;
      return `<div class="spark-card ${sel ? 'selected' : ''} ${c.premium ? 'premium' : ''} ${c.exclusive ? 'exclusive' : ''} ${locked ? 'locked' : ''} ${master ? 'master' : ''}">${orb(c.id, true)}
        <div class="body"><div class="name" style="font-weight:750;font-size:18px">${t(`char.${c.id}.name` as I18nKey)}
          ${tag}</div>
          ${this.perkChips(c.id)}${owned ? this.masteryLine(c.id) : ''}
          <div class="bars">${bar(t('sparks.agility'), 1 / c.hitMul / 1.45, c.color)}${bar(t('sparks.trail'), c.trailMul / 1.35, c.color)}${bar(t('sparks.hearts'), hearts, '#ff5577')}</div>
          ${btn}</div></div>`;
    }).join('');
    const html = `${this.backBar(t('sparks.title'), this.wallet())}
      <div class="screen-inner top">${this.trailPicker()}<p class="hint" style="margin:0">${t('sparks.desc')}</p><div class="list">${cards}</div></div>`;
    this.open('sparks', html, {
      onAction: (act, el) => {
        if (this.walletAction(act)) return;
        const id = el.dataset.id as CharacterId;
        if (act === 'back') {
          this.app.audio.uiBack();
          goBack();
        } else if (act === 'select') {
          this.app.selectChar(id);
          // Picking a spark from the preparation screen goes straight back there.
          if (returnTo) returnTo();
          else this.showSparks();
        } else if (act === 'buy') {
          if (this.app.buyChar(id, el.dataset.cur as Currency)) this.showSparks(returnTo);
        } else if (act === 'trail') {
          if (this.app.pickTrail(el.dataset.id as TrailId)) this.showSparks(returnTo);
        } else if (act === 'iap') {
          this.app.audio.uiClick();
          void this.app.buyProduct(el.dataset.id as ProductId).then(() => {
            if (this.screenName === 'sparks') this.showSparks(returnTo);
          });
        }
      },
    });
  }

  // ───────────────────────── Achievements ─────────────────────────

  showAchievements(): void {
    const s = this.app.save.data;
    const done = ACHIEVEMENTS.filter((a) => s.ach[a]).length;
    const items = ACHIEVEMENTS.map((a) => {
      const ok = !!s.ach[a];
      return `<div class="item ${ok ? 'done' : 'locked'}"><div class="ico-wrap">${icon(ok ? 'trophy' : 'lock', 22)}</div>
        <div class="body"><div class="name">${t(`ach.${a}.name` as I18nKey)}</div><div class="desc">${t(`ach.${a}.desc` as I18nKey)}</div></div>
        ${this.price('diamonds', achievementDiamonds(a))}</div>`;
    }).join('');
    const stones = MILESTONES.map((m) => {
      const ok = s.milestones.includes(m.wave);
      return `<div class="stone ${ok ? 'done' : ''}"><b>${m.wave}</b>${this.price('diamonds', m.diamonds)}</div>`;
    }).join('');
    const st = s.stats;
    const stat = (k: I18nKey, v: string) => `<div class="stat"><div class="v">${v}</div><div class="l">${t(k)}</div></div>`;
    const html = `${this.backBar(t('ach.title'), `<div class="pill">${icon('trophy', 16)}<span>${t('ach.progress', { n: done, max: ACHIEVEMENTS.length })}</span></div>`)}
      <div class="screen-inner top">
        <div class="panel"><h3>${t('stats.title')}</h3><div class="stats">
          ${stat('stats.runs', fmt(st.runs))}${stat('stats.kills', fmt(st.kills))}${stat('stats.loops', fmt(st.loops))}
          ${stat('stats.bestWave', fmt(st.bestWave))}${stat('stats.bestLoop', fmt(st.bestLoop))}${stat('stats.bestCombo', '×' + fmt(st.bestCombo))}
          ${stat('stats.bossKills', fmt(st.bossKills))}${stat('stats.shardsTotal', fmt(st.shardsTotal))}${stat('stats.playTime', fmtTime(st.playTime))}
        </div></div>
        <div class="panel"><h3>${t('milestones.title')}</h3><div class="stones">${stones}</div></div>
        <div class="list">${items}</div>
      </div>`;
    this.open('achievements', html, {
      onAction: (act) => {
        if (act === 'back') this.back();
      },
    });
  }

  // ───────────────────────── Settings ─────────────────────────

  // ───────────────────────── Cloud save & leaderboards ─────────────────────────

  /** The cloud holds more progress than this device: the player picks which save to keep. */
  showCloudChoice(local: SaveData, cloud: CloudSave, done: (useCloud: boolean) => void): void {
    const col = (label: string, s: SaveData, at = 0) => `<div class="save-col">
      <span class="k"><span>${esc(label)}</span>${at ? `<span>${new Date(at).toLocaleDateString(getLang() === 'de' ? 'de-DE' : 'en-US')}</span>` : ''}</span>
      <b>${t('cloud.level', { n: s.level })}</b>
      <span>${t('cloud.runs', { n: fmt(s.stats.runs) })} · ${t('cloud.best', { n: fmt(s.best) })}</span></div>`;
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog cloud-choice">
      <h3>${icon('cloud', 20)}${t('cloud.title')}</h3>
      <p>${t('cloud.found')}</p>
      <div class="save-compare">${col(t('cloud.cloud'), cloud.save, cloud.at)}${col(t('cloud.device'), local)}</div>
      <p class="hint">${t('cloud.overwrite')}</p>
      <div class="grid2">
        <button class="btn ghost" data-act="local">${t('cloud.keep')}</button>
        <button class="btn primary" data-act="cloud">${t('cloud.useCloud')}</button></div></div>`;
    wrap.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act !== 'local' && act !== 'cloud') return;
      this.app.audio.uiClick();
      wrap.remove();
      done(act === 'cloud');
    });
    document.body.appendChild(wrap);
  }

  /** Leaderboards inside the game: top 10 plus the player's own place. */
  showRanks(back: () => void, key?: LeaderboardKey): void {
    const boards = this.app.games.boards();
    const active = key && boards.includes(key) ? key : boards[0];
    const label = (k: LeaderboardKey) => t(`ranks.${k}` as I18nKey);
    const tabs = boards
      .map((k) => `<button class="${k === active ? 'on' : ''}" data-act="tab" data-key="${k}">${esc(label(k))}</button>`)
      .join('');
    const html = `${this.backBar(t('ranks.title'))}
      <div class="screen-inner top">
        <div class="mode-seg ranks-tabs" style="grid-template-columns:repeat(${Math.max(1, boards.length)},1fr)">${tabs}</div>
        <div class="panel rank-list" id="rank-list"><p class="hint rank-msg">${t('ranks.loading')}</p></div>
        <button class="btn" data-act="all">${icon('trophy', 20)}${t('ranks.all')}</button>
      </div>`;
    const el = this.open('ranks', html, {
      onAction: (act, btn) => {
        if (act === 'back') {
          this.app.audio.uiBack();
          back();
        } else if (act === 'tab') {
          this.app.audio.uiClick();
          this.showRanks(back, btn.dataset.key as LeaderboardKey);
        } else if (act === 'all') {
          this.app.audio.uiClick();
          void this.app.games.showLeaderboards().then((ok) => {
            if (!ok) this.toast(t('games.title'), t('games.failed'), 'trophy');
          });
        }
      },
    });
    if (!active) return;
    void this.app.games.topScores(active).then((r) => {
      const list = el.querySelector('#rank-list');
      if (list && el.isConnected) list.innerHTML = this.rankRows(r);
    });
  }

  private cloudHint(): string {
    const g = this.app.games;
    if (!g.signedIn) return t('cloud.signin');
    const at = this.app.cloudSavedAt;
    if (!at) return t('cloud.auto');
    const time = new Date(at).toLocaleTimeString(getLang() === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    return `${t('cloud.auto')} ${t('cloud.last', { time })}`;
  }

  private rankRows(r: TopScores | null): string {
    if (!r) return `<p class="hint rank-msg">${t('games.failed')}</p>`;
    if (!r.scores.length) return `<p class="hint rank-msg">${t('ranks.empty')}</p>`;
    const row = (x: { rank: number; name: string; score: number }, me: boolean) =>
      `<li class="${me ? 'me' : ''}"><span class="rk">${x.rank > 0 ? fmt(x.rank) : '–'}</span>
        <span class="nm">${esc(me ? t('ranks.you') : x.name)}</span><span class="sc">${fmt(x.score)}</span></li>`;
    const me = r.me;
    const isMe = (x: { rank: number; score: number }) => !!me && x.rank === me.rank && x.score === me.score;
    const top = r.scores.map((x) => row(x, isMe(x))).join('');
    const own = me && !r.scores.some(isMe) ? `<li class="gap" aria-hidden="true">···</li>${row(me, true)}` : '';
    return `<ol>${top}${own}</ol>`;
  }

  showSettings(from: 'menu' | 'pause'): void {
    const st = this.app.save.data.settings;
    const slider = (key: string, label: I18nKey, v: number, min: number, max: number, step: number) =>
      `<div class="row"><label for="s-${key}">${t(label)}</label>
       <input id="s-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-key="${key}" style="--v:${((v - min) / (max - min)) * 100}%"></div>`;
    const toggle = (key: string, label: I18nKey, on: boolean) =>
      `<div class="row"><label>${t(label)}</label><button class="toggle ${on ? 'on' : ''}" data-act="toggle" data-key="${key}" aria-pressed="${on}" aria-label="${t(label)}"></button></div>`;
    const seg = (key: string, label: I18nKey, value: string, options: [string, string][]) =>
      `<div class="row"><label>${t(label)}</label><div class="seg">${options
        .map(([v, l]) => `<button class="${v === value ? 'on' : ''}" data-act="seg" data-key="${key}" data-value="${v}">${esc(l)}</button>`)
        .join('')}</div></div>`;
    const privacy = this.app.platform.privacyOptionsAvailable()
      ? `<button class="btn" data-act="consent">${t('settings.privacy')}</button>`
      : '';
    const html = `${this.backBar(t('settings.title'))}
      <div class="screen-inner top">
        <div class="panel"><h3>${t('settings.audio')}</h3>
          ${slider('music', 'settings.music', st.music, 0, 1, 0.05)}
          ${slider('sfx', 'settings.sfx', st.sfx, 0, 1, 0.05)}
        </div>
        <div class="panel"><h3>${t('settings.controls')}</h3>
          ${seg('control', 'settings.control', st.control, [['direct', t('settings.control.direct')], ['relative', t('settings.control.relative')]])}
          <p class="hint control-hint">${t(st.control === 'direct' ? 'settings.control.directHint' : 'settings.control.relativeHint')}</p>
          ${
            st.control === 'direct'
              ? seg('offset', 'settings.offset', st.offset, [['small', t('settings.offset.small')], ['medium', t('settings.offset.medium')], ['large', t('settings.offset.large')]])
              : slider('sensitivity', 'settings.sensitivity', st.sensitivity, 0.6, 1.8, 0.05)
          }
          ${toggle('haptics', 'settings.haptics', st.haptics)}
        </div>
        <div class="panel"><h3>${t('settings.display')}</h3>
          ${toggle('shake', 'settings.shake', st.shake)}
          ${toggle('reducedMotion', 'settings.reducedMotion', st.reducedMotion)}
          ${this.app.glowSupported ? toggle('glow', 'settings.glow', st.glow) : ''}
          ${seg('quality', 'settings.quality', st.quality, [['auto', t('settings.quality.auto')], ['high', t('settings.quality.high')], ['low', t('settings.quality.low')]])}
          ${seg('lang', 'settings.lang', st.lang, [['auto', t('settings.lang.auto')], ['de', 'DE'], ['en', 'EN']])}
        </div>
        ${
          this.app.games.configured
            ? `<div class="panel"><h3>${t('games.title')}</h3><div class="grid2">
          <button class="btn" data-act="leaderboards">${icon('trophy', 20)}${t('games.leaderboards')}</button>
          <button class="btn" data-act="gameach">${icon('star', 20)}${t('games.achievements')}</button></div>
          ${
            from === 'menu'
              ? `<div class="row cloud-row"><label>${t('cloud.row')}</label>
            <button class="btn small" data-act="cloudsave">${icon('cloud', 16)}${t('cloud.saveNow')}</button></div>
          <p class="hint" id="cloud-hint">${this.cloudHint()}</p>`
              : ''
          }</div>`
            : ''
        }
        ${
          from === 'menu'
            ? `<div class="panel"><h3>${t('settings.data')}</h3><div class="list">
          <button class="btn" data-act="tutorial">${t('settings.tutorial')}</button>
          ${privacy}
          <button class="btn" data-act="policy">${t('settings.privacyPolicy')}</button>
          <button class="btn danger" data-act="reset">${t('settings.reset')}</button></div>
          ${this.app.save.persistent ? '' : `<p class="hint">${t('settings.noStorage')}</p>`}</div>`
            : ''
        }
        <p class="hint">LUMEN LOOP v${__APP_VERSION__} · ${t('settings.credits')}</p>
      </div>`;
    const el = this.open('settings', html, {
      dim: from === 'pause',
      onAction: (act, btn) => {
        const key = btn.dataset.key as keyof typeof st;
        if (act === 'back') {
          this.app.audio.uiBack();
          if (from === 'pause') this.showPause();
          else this.showMenu();
        } else if (act === 'toggle') {
          (st[key] as boolean) = !st[key];
          btn.classList.toggle('on', !!st[key]);
          btn.setAttribute('aria-pressed', String(!!st[key]));
          this.app.applySettings();
          this.app.audio.uiClick();
          if (key === 'haptics' && st.haptics) this.app.haptics.buzz(30);
        } else if (act === 'seg') {
          (st[key] as string) = btn.dataset.value!;
          btn.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
          this.app.applySettings();
          this.app.audio.uiClick();
          if (key === 'lang' || key === 'control') this.showSettings(from);
        } else if (act === 'tutorial') {
          this.app.audio.uiSelect();
          this.app.startTutorial();
        } else if (act === 'leaderboards' && this.app.games.boards().length) {
          this.app.audio.uiClick();
          this.showRanks(() => this.showSettings(from));
          this.app.onSignedIn();
        } else if (act === 'leaderboards' || act === 'gameach') {
          this.app.audio.uiClick();
          const open = act === 'leaderboards' ? this.app.games.showLeaderboards() : this.app.games.showAchievements();
          void open.then((ok) => {
            if (ok) this.app.onSignedIn();
            else this.toast(t('games.title'), t('games.failed'), 'trophy');
          });
        } else if (act === 'cloudsave') {
          this.app.audio.uiClick();
          btn.setAttribute('disabled', '');
          void this.app.cloudSaveNow().then((res) => {
            btn.removeAttribute('disabled');
            const hint = el.querySelector('#cloud-hint');
            if (hint) hint.textContent = this.cloudHint();
            if (res === 'saved') this.toast(t('cloud.title'), t('cloud.saved'), 'cloud');
            else if (res === 'failed') this.toast(t('cloud.title'), t('games.failed'), 'cloud');
          });
        } else if (act === 'consent') {
          void this.app.platform.showPrivacyOptions();
        } else if (act === 'policy') {
          this.showPrivacy();
        } else if (act === 'reset') {
          this.dialog(t('settings.resetConfirm'), t('settings.reset'), () => {
            this.app.resetSave();
            this.showMenu();
          });
        }
      },
    });
    el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) => {
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        (st[input.dataset.key as 'music'] as number) = v;
        input.style.setProperty('--v', `${((v - parseFloat(input.min)) / (parseFloat(input.max) - parseFloat(input.min))) * 100}%`);
        this.app.applySettings();
      });
      input.addEventListener('change', () => this.app.audio.uiClick());
    });
  }

  showPrivacy(): void {
    const html = `${this.backBar(t('settings.privacyPolicy'))}
      <div class="screen-inner top"><div class="panel policy">${privacyHtml()}</div></div>`;
    this.open('privacy', html, {
      onAction: (act) => {
        if (act === 'back') this.showSettings('menu');
      },
    });
  }

  // ───────────────────────── Pause ─────────────────────────

  showPause(): void {
    const w = this.app.world;
    const ups = w ? (Object.entries(w.upgrades) as [UpgradeId, number][]).filter(([, l]) => l > 0) : [];
    const chips = ups.length
      ? `<div class="chips">${ups
          .map(([id, l]) => `<span class="chip">${icon(id, 18)}${t(`upgrade.${id}.name` as I18nKey)} <small>${l}/${getUpgrade(id).max}</small></span>`)
          .join('')}</div>`
      : `<p class="hint" style="margin:0;text-align:left">${t('pause.none')}</p>`;
    const html = `<div class="screen-inner">
        <div class="upgrade-head"><h2 style="font-size:34px">${t('pause.title')}</h2></div>
        <button class="btn primary" data-act="resume">${icon('play', 22)}${t('pause.resume')}</button>
        <div class="panel"><h3>${t('pause.upgrades')}</h3>${chips}</div>
        <div class="grid2">
          <button class="btn" data-act="settings">${icon('gear', 24)}${t('menu.settings')}</button>
          <button class="btn" data-act="restart">${icon('refresh', 24)}${t('pause.restart')}</button>
        </div>
        <button class="btn ghost" data-act="menu">${t('pause.menu')}</button>
      </div>`;
    this.open('pause', html, {
      dim: true,
      onAction: (act) => {
        if (act === 'resume') {
          this.app.audio.uiSelect();
          this.app.resume();
        } else if (act === 'settings') {
          this.app.audio.uiClick();
          this.showSettings('pause');
        } else if (act === 'restart') {
          this.dialog(t('pause.confirmQuit'), t('pause.restart'), () => this.app.restart());
        } else if (act === 'menu') {
          this.dialog(t('pause.confirmQuit'), t('pause.menu'), () => this.app.quitToMenu());
        }
      },
    });
  }

  // ───────────────────────── Upgrade choice ─────────────────────────

  showUpgrade(offer: UpgradeId[], wave: number, rerolls: number, adReroll: boolean): void {
    const w = this.app.world!;
    const cards = offer
      .map((id) => {
        const def = getUpgrade(id);
        const lv = w.upgrades[id] ?? 0;
        return `<button class="card ${def.rarity}" data-act="pick" data-id="${id}">
          <div class="ico-wrap">${icon(id, 28)}</div>
          <div class="body"><div class="top"><span class="name">${t(`upgrade.${id}.name` as I18nKey)}</span>
            <span class="rarity">${t(`rarity.${def.rarity}` as I18nKey)}</span></div>
            <div class="desc">${upgradeDesc(id, lv + 1)}</div>${def.max > 1 ? pips(lv, def.max, true) : ''}
            ${def.requires ? `<div class="fusion">${icon('spark', 13)}${t('upgrade.fusion', fusionNames(def.requires))}</div>` : ''}</div>
        </button>`;
      })
      .join('');
    const rerollBtn =
      rerolls > 0
        ? `<button class="btn ghost small" data-act="reroll">${icon('refresh', 18)}${t('upgrade.reroll', { n: rerolls })}</button>`
        : adReroll
          ? `<button class="btn ghost small" data-act="adreroll">${icon('ad', 18)}${t('upgrade.adReroll')}</button>`
          : '';
    const html = `<div class="screen-inner">
        <div class="upgrade-head"><div class="kicker">${t('upgrade.subtitle', { n: wave })}</div><h2>${t('upgrade.title')}</h2></div>
        <div class="cards">${cards}</div>
        ${rerollBtn}
      </div>`;
    let picked = false;
    const el = this.open('upgrade', html, {
      dim: true,
      onAction: (act, btn) => {
        if (picked) return;
        if (act === 'pick') {
          picked = true;
          btn.classList.add('picked');
          this.app.audio.uiSelect();
          this.app.haptics.buzz(20);
          setTimeout(() => this.app.pickUpgrade(btn.dataset.id as UpgradeId), 220);
        } else if (act === 'reroll') {
          this.app.audio.uiClick();
          this.app.rerollUpgrade();
        } else if (act === 'adreroll') {
          this.app.audio.uiClick();
          void this.app.adReroll();
        }
      },
    });
    // Ignore taps for a moment – the steering finger may still be on the screen.
    const cardsEl = el.querySelector('.cards')!;
    setTimeout(() => cardsEl.classList.add('armed'), 650);
  }

  // ───────────────────────── Continue (revive) ─────────────────────────

  showContinue(offer: ContinueOffer, timeLeft = REVIVE_COUNTDOWN): void {
    const s = this.app.save.data;
    const opts: string[] = [];
    if (offer.adAvailable) {
      opts.push(`<button class="btn primary revive-ad" data-act="ad">${icon('ad', 24)}<span class="col"><b>${t('revive.ad')}</b><small>${t('revive.adSub')}</small></span></button>`);
    } else if (offer.coins > 0) {
      opts.push(`<button class="btn" data-act="coins" ${s.bank >= offer.coins ? '' : 'disabled'}>${t('revive.pay')} ${this.price('coins', offer.coins)}</button>`);
    }
    opts.push(`<button class="btn gem-btn" data-act="diamonds" ${s.diamonds >= offer.diamonds ? '' : 'disabled'}>${t('revive.pay')} ${this.gemCost(offer.diamonds)}</button>`);
    const html = `<div class="screen-inner">
        <div class="continue-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="track"/><circle cx="60" cy="60" r="54" class="fill"/></svg><span>${Math.ceil(timeLeft)}</span></div>
        <div class="upgrade-head"><h2>${t('revive.title')}</h2><p class="hint" style="margin:6px 0 0">${t('revive.sub')}</p></div>
        <div class="list">${opts.join('')}</div>
        ${s.diamonds < offer.diamonds ? `<button class="btn ghost small" data-act="shop">${icon('gem', 16)}${t('menu.shop')}</button>` : ''}
        <button class="btn ghost" data-act="giveup">${t('revive.giveUp')}</button>
      </div>`;
    let left = timeLeft;
    let paused = false;
    let finished = false;
    const el = this.open('continue', html, {
      dim: true,
      onAction: (act) => {
        // While an ad is loading/playing every other button waits.
        if (finished || paused) return;
        if (act === 'giveup') {
          finished = true;
          clearInterval(timer);
          this.app.audio.uiBack();
          this.app.giveUp();
        } else if (act === 'shop') {
          // Buying diamonds pauses the countdown; the dialog re-opens afterwards.
          paused = true;
          finished = true;
          clearInterval(timer);
          this.showShopOverlay(() => this.showContinue(this.app.continueOffer()));
        } else {
          paused = true;
          void this.app.continueWith(act as 'ad' | Currency).then((ok) => {
            if (ok) {
              finished = true;
              clearInterval(timer);
            } else if (this.app.state === 'continue') {
              const next = this.app.continueOffer();
              if (next.adAvailable !== offer.adAvailable) {
                // No ad available → the shard option appears; keep the remaining time.
                finished = true;
                clearInterval(timer);
                this.showContinue(next, Math.max(2, left));
              } else {
                paused = false; // cancelled – the countdown resumes
              }
            }
          });
        }
      },
    });
    const num = el.querySelector('.continue-ring span')!;
    const fill = el.querySelector<SVGCircleElement>('.continue-ring .fill')!;
    const circ = 2 * Math.PI * 54;
    fill.style.strokeDasharray = `${circ}`;
    fill.style.strokeDashoffset = `${circ * (1 - left / REVIVE_COUNTDOWN)}`;
    const timer = window.setInterval(() => {
      // Switching apps must not cost the run: the countdown only runs while the game is visible.
      if (paused || finished || document.visibilityState === 'hidden') return;
      left -= 0.1;
      fill.style.strokeDashoffset = `${circ * (1 - left / REVIVE_COUNTDOWN)}`;
      num.textContent = String(Math.max(0, Math.ceil(left)));
      if (left <= 0) {
        finished = true;
        clearInterval(timer);
        this.app.giveUp();
      }
    }, 100);
  }

  /** Minimal shop sheet on top of the continue dialog (diamond packs only). */
  private showShopOverlay(onClose: () => void): void {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    const packs = PRODUCTS.filter((p) => p.id.startsWith('diamonds_'))
      .map((p) => `<button class="btn small" data-act="buy" data-id="${p.id}">${this.price('diamonds', p.reward.diamonds ?? 0)} · ${esc(this.app.priceOf(p.id))}</button>`)
      .join('');
    wrap.innerHTML = `<div class="dialog"><h2>${t('shop.diamonds')}</h2>
      ${this.app.platform.demo ? `<p class="demo-note">${t('shop.demo')}</p>` : ''}
      <div class="list">${packs}</div>
      <button class="btn ghost" data-act="close">${t('common.back')}</button></div>`;
    wrap.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'close') {
        wrap.remove();
        onClose();
      } else if (btn.dataset.act === 'buy') {
        void this.app.buyProduct(btn.dataset.id as ProductId).then(() => {
          wrap.remove();
          onClose();
        });
      }
    });
    document.body.appendChild(wrap);
  }

  // ───────────────────────── Game over ─────────────────────────

  showGameOver(r: RunResult): void {
    const stat = (k: I18nKey, v: string) => `<div class="stat"><div class="v">${v}</div><div class="l">${t(k)}</div></div>`;
    const s = this.app.save.data;
    const need = xpForLevel(s.level);
    const rewards: string[] = [];
    rewards.push(`<div class="reward-row">${icon('star', 18)}<span>${t('over.xp', { n: fmt(r.xp) })}</span>
      <span class="xpbar"><i style="width:${Math.round((s.xp / need) * 100)}%"></i></span><b>${t('menu.level', { n: s.level })}</b></div>`);
    if (r.levelUps.length > 0) {
      // Several level-ups in one run share one line with the summed rewards.
      const first = r.levelUps[0].level;
      const last = r.levelUps[r.levelUps.length - 1].level;
      const sum = r.levelUps.reduce<Reward>((acc, lu) => ({ coins: (acc.coins ?? 0) + (lu.reward.coins ?? 0), diamonds: (acc.diamonds ?? 0) + (lu.reward.diamonds ?? 0) }), {});
      const label = first === last ? t('over.levelUp', { n: last }) : t('over.levelUps', { a: first, b: last });
      rewards.push(`<div class="reward-row hl">${icon('star', 18)}<span>${label}</span>${this.rewardChips(sum)}</div>`);
    }
    for (const g of r.weeklyGoals)
      rewards.push(`<div class="reward-row hl">${icon('trophy', 18)}<span>${t('over.weekly', { medal: t(`weekly.medal${g}` as I18nKey) })}</span>${this.rewardChips(WEEKLY_REWARDS[g])}</div>`);
    if (r.mastery.gained.length > 0) {
      const gems = r.mastery.gained.reduce((n, lv) => n + masteryReward(lv), 0);
      rewards.push(`<div class="reward-row hl">${this.unlockIcon({ kind: 'char', id: r.mastery.spark }, 18)}<span>${t('over.mastery', { name: t(`char.${r.mastery.spark}.name` as I18nKey), n: r.mastery.level })}</span>${this.price('diamonds', gems)}</div>`);
    }
    if (r.pass.gained > 0) rewards.push(`<div class="reward-row hl">${icon('crown', 18)}<span>${t('over.pass', { n: r.pass.tier })}</span></div>`);
    for (const u of r.unlocked) rewards.push(`<div class="reward-row unlock">${this.unlockIcon(u, 18)}<span>${t('over.unlocked', { name: this.unlockName(u) })}</span></div>`);
    for (const m of r.milestones) rewards.push(`<div class="reward-row hl">${icon('gem', 18)}<span>${t('over.milestone', { n: m.wave })}</span>${this.price('diamonds', m.diamonds)}</div>`);
    if (r.missionsDone) rewards.push(`<div class="reward-row">${icon('target', 18)}<span>${t('over.missionsDone', { n: r.missionsDone })}</span></div>`);
    const ach = r.newAchievements.length
      ? `<div class="chips">${r.newAchievements.map((a) => `<span class="chip">${icon('trophy', 16)}${t(`ach.${a}.name` as I18nKey)}</span>`).join('')}</div>`
      : '';
    const html = `<div class="screen-inner">
        <div class="over-title"><h2>${t(r.campaign?.victory ? 'campaign.won' : r.timeUp ? 'over.timeUp' : 'over.title')}</h2><p>${
           r.campaign
             ? t('campaign.level', { w: getLevel(r.campaign.level).world + 1, n: getLevel(r.campaign.level).number }) + ' · '
             : r.weekly
               ? t('events.weekly') + ' · '
               : r.mode !== 'normal' && !r.daily
                 ? t(`mode.${r.mode}.name` as I18nKey) + ' · '
                 : ''
         }${t('over.subtitle')}</p></div>
        <div class="big-score"><div class="l">${t('over.score')}</div><div class="v" id="final-score">0</div>
          ${r.newBest ? `<div class="new-best">${t(r.daily ? 'over.newDaily' : 'over.newBest')}</div>` : ''}</div>
        <div class="stats">
          ${stat('over.wave', fmt(r.wave))}${stat('over.kills', fmt(r.kills))}${stat('over.loops', fmt(r.loops))}
          ${stat('over.bestLoop', fmt(r.bestLoop))}${stat('over.combo', r.maxCombo ? '×' + fmt(r.maxCombo) : '–')}${stat('over.time', fmtTime(r.time))}
        </div>
        <div class="panel earned-panel">
          <div class="earned">${icon('shard', 22)}<span id="earned-shards">+${fmt(r.shards)}</span> <span style="color:var(--muted);font-weight:550;font-size:15px">${t('over.shards')}</span></div>
          ${r.canDouble ? `<button class="btn double" data-act="double">${icon('ad', 20)}<span class="col"><b>${t('over.double')}</b><small>${t('over.doubleSub', { n: fmt(r.shards) })}</small></span></button>` : ''}
        </div>
        ${
          r.campaign
            ? `<div class="panel level-result ${r.campaign.victory ? 'won' : 'lost'}">
          ${this.stars(r.campaign.stars.filter(Boolean).length, 30)}
          <ul class="star-goals">${[t('campaign.star1'), t('campaign.star2'), t('campaign.star3', { n: fmt(getLevel(r.campaign.level).starScore) })]
            .map((g, i) => `<li class="${r.campaign!.stars[i] ? 'done' : ''}">${icon(r.campaign!.stars[i] ? 'check' : 'starFill', 15)}<span>${esc(g)}</span></li>`)
            .join('')}</ul>
          ${r.campaign.reward.coins || r.campaign.reward.diamonds ? `<div class="reward-row hl">${icon('gift', 18)}<span>${t('campaign.reward')}</span>${this.rewardChips(r.campaign.reward)}</div>` : ''}
        </div>`
            : ''
        }
        ${
          r.challenge
            ? `<div class="panel duel ${r.challenge.won ? 'won' : 'lost'}"><div class="duel-title">${t(r.challenge.won ? 'challenge.won' : 'challenge.lost')}</div>
          <div class="duel-scores"><span>${t('challenge.you')}<b>${fmt(r.score)}</b></span><span>${t('challenge.friend')}<b>${fmt(r.challenge.target)}</b></span></div></div>`
            : ''
        }
        <div class="panel"><h3>${t('over.rewards')}</h3><div class="rewards">${rewards.join('')}</div>${ach}</div>
        ${r.shareCode ? `<button class="btn ghost" data-act="share">${icon('share', 20)}${t(r.challenge ? 'challenge.shareBack' : 'challenge.shareBtn')}</button>` : ''}
        ${r.canAfford ? `<p class="hint" style="margin:0">${t('over.workshopHint')}</p>` : ''}
        ${
          r.campaign
            ? (() => {
                const next = r.campaign.victory && r.campaign.level + 1 < LEVEL_COUNT;
                return `${next ? `<button class="btn primary" data-act="nextlevel">${icon('play', 22)}${t('campaign.next')}</button>` : `<button class="btn primary" data-act="again">${icon('refresh', 22)}${t('over.again')}</button>`}
        <div class="grid2">
          ${next ? `<button class="btn" data-act="again">${icon('refresh', 24)}${t('over.again')}</button>` : `<button class="btn" data-act="workshop">${icon('wrench', 24)}${t('menu.workshop')}</button>`}
          <button class="btn" data-act="campaign">${icon('map', 24)}${t('campaign.title')}</button>
        </div>`;
              })()
            : `<button class="btn primary" data-act="again">${icon('refresh', 22)}${t('over.again')}</button>
        <div class="grid2">
          <button class="btn" data-act="workshop">${icon('wrench', 24)}${t('menu.workshop')}</button>
          <button class="btn" data-act="menu">${icon('back', 24)}${t('over.menu')}</button>
        </div>`
        }
      </div>`;
    const el = this.open('gameover', html, {
      dim: true,
      onAction: (act, btn) => {
        if (act === 'share') {
          this.app.audio.uiClick();
          void this.app.shareRun();
          return;
        }
        if (act === 'double') {
          btn.setAttribute('disabled', '');
          void this.app.doubleShards().then((ok) => {
            if (ok) {
              btn.outerHTML = `<div class="doubled">${icon('check', 18)}${t('over.doubled')}</div>`;
              el.querySelector('#earned-shards')!.textContent = `+${fmt(r.shards * 2)}`;
            } else btn.removeAttribute('disabled');
          });
          return;
        }
        this.app.audio.uiClick();
        if (act === 'again') void this.app.afterRun(() => this.app.replay());
        else if (act === 'nextlevel' && r.campaign) {
          const next = r.campaign.level + 1;
          void this.app.afterRun(() => this.app.startLevel(next));
        } else if (act === 'campaign')
          void this.app.afterRun(() => {
            this.app.toMenuState();
            this.showCampaign();
          });
        else if (act === 'workshop')
          void this.app.afterRun(() => {
            this.app.toMenuState();
            this.showWorkshop();
          });
        else if (act === 'menu') void this.app.afterRun(() => this.app.quitToMenu());
      },
    });
    // Count-up animation for the final score.
    const target = el.querySelector('#final-score')!;
    const start = performance.now();
    const dur = Math.min(1400, 300 + r.score / 20);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      target.textContent = fmt(Math.round(r.score * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && target.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ───────────────────────── Tutorial ─────────────────────────

  tutorial(text: string, step: number, total: number, finish?: () => void): void {
    this.tut?.remove();
    const el = document.createElement('div');
    el.className = 'tut';
    let dots = '';
    for (let i = 0; i < total; i++) dots += `<i class="${i <= step ? 'on' : ''}"></i>`;
    el.innerHTML = `<div class="k"><span>${t('tut.title')} <span class="dots">${dots}</span></span>
        ${finish ? '' : `<button class="tut-skip" data-act="skip">${t('tut.skip')}</button>`}</div><p>${esc(text)}</p>
      ${finish ? `<div class="actions"><button class="btn primary" data-act="go">${t('tut.start')}</button></div>` : ''}`;
    el.querySelector('[data-act=go]')?.addEventListener('click', () => finish?.());
    el.querySelector('[data-act=skip]')?.addEventListener('click', () => this.app.finishTutorial());
    document.body.appendChild(el);
    this.tut = el;
  }

  clearTutorial(): void {
    this.tut?.remove();
    this.tut = null;
  }
}
